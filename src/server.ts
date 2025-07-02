import fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { createClient } from "redis";
import dotenv from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";
import { countTokensAndCost } from "./token.js";
import { ledgerKey, getBudgetPeriods } from "./ledger.js";
import { evaluatePolicy } from "./policy/opa.js";
import { readBudget, writeBudget, deleteBudget } from "./budget.js";

dotenv.config();

const DEFAULT_BUDGET = Number(
  process.env.DEFAULT_BUDGET_USD || process.env.MAX_MONTHLY_USD || 50,
);

const BUDGET_PERIODS = getBudgetPeriods();

export async function buildServer() {
  const app = fastify({ logger: true });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "BudgetGuard API",
        description: "Usage proxy and admin endpoints",
        version: "0.1.0",
      },
      components: {
        securitySchemes: {
          AdminApiKey: {
            type: "apiKey",
            in: "header",
            name: "X-Admin-Key",
            description: "Admin API key from .env",
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  let prisma: PrismaClient | undefined;
  app.addHook("onClose", async () => {
    await prisma?.$disconnect();
  });
  const getPrisma = async () => {
    if (!prisma) {
      prisma = new PrismaClient();
      await prisma.$connect();
    }
    return prisma;
  };

  let redisClient: ReturnType<typeof createClient> | undefined;
  if (process.env.REDIS_URL) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    await redisClient.connect();
  }

  app.addHook("onSend", async (req, _reply, payload) => {
    if (!redisClient) return payload;

    let usd = 0;
    let promptTok = 0;
    let compTok = 0;

    try {
      const body = req.body as Record<string, unknown> | undefined;
      const resp = typeof payload === "string" ? JSON.parse(payload) : payload;
      const model = (body?.model as string) || (resp?.model as string);
      if (model && (body?.prompt || body?.messages)) {
        const {
          promptTokens,
          completionTokens,
          usd: cost,
        } = countTokensAndCost({
          model,
          prompt:
            (body?.prompt as string) ||
            ((body?.messages as Array<{ role: string; content: string }>) ??
              []),
          completion:
            (resp?.choices?.[0]?.text as string) ||
            (resp?.choices?.[0]?.message?.content as string),
        });
        usd = cost;
        promptTok = promptTokens;
        compTok = completionTokens;
      }
    } catch {
      // ignore parse errors
    }

    await redisClient.xAdd("bg_events", "*", {
      ts: Date.now().toString(),
      tenant: (req.headers["x-tenant-id"] as string) || "public",
      route: req.routeOptions.url ?? req.url,
      usd: usd.toFixed(6),
      promptTok: promptTok.toString(),
      compTok: compTok.toString(),
    });
    const tenant = (req.headers["x-tenant-id"] as string) || "public";
    for (const period of BUDGET_PERIODS) {
      const key = ledgerKey(period);
      await redisClient.incrByFloat(`ledger:${tenant}:${key}`, usd);
    }
    return payload;
  });

  await app.register(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rateLimit as any,
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: redisClient as any,
      max: Number(process.env.MAX_REQS_PER_MIN || 100),
      timeWindow: "1 minute",
      keyGenerator: (req: FastifyRequest) =>
        (req.headers["x-tenant-id"] as string) || "public",
      errorResponseBuilder: () => ({ error: "Rate limit exceeded" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  );

  app.setErrorHandler((err, _req, reply) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any).error === "Rate limit exceeded") {
      reply.code(429).send({ error: "Rate limit exceeded" });
      return;
    }
    reply.send(err);
  });

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
          },
        },
      },
    },
    async () => ({ ok: true }),
  );

  // proxy OpenAI completions endpoint
  app.post(
    "/v1/completions",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            model: { type: "string" },
            prompt: {},
          },
          required: ["model"],
        },
        response: { 200: { type: "object", additionalProperties: true } },
        parameters: [
          {
            in: "header",
            name: "X-Tenant-Id",
            schema: { type: "string" },
            required: false,
            description: "Tenant identifier for budget/rate limiting",
          },
        ],
      },
    },
    async (req, reply) => {
      const tenant = (req.headers["x-tenant-id"] as string) || "public";
      const prisma = await getPrisma();
      for (const period of BUDGET_PERIODS) {
        const key = ledgerKey(period);
        const budget = await readBudget({
          tenant,
          period,
          prisma,
          redis: redisClient,
          defaultBudget: DEFAULT_BUDGET,
        });
        let usage = 0;
        if (redisClient) {
          const cur = await redisClient.get(`ledger:${tenant}:${key}`);
          if (cur) usage = parseFloat(cur);
        }
        const allow = await evaluatePolicy({
          usage,
          budget,
          route: req.routeOptions.url ?? req.url,
          time: new Date().getHours(),
          tenant,
        });
        app.log.info(
          {
            input: {
              usage,
              budget,
              route: req.routeOptions.url ?? req.url,
              tenant,
            },
            allow,
          },
          "policy decision",
        );
        if (!allow) {
          return reply.code(403).send({
            error: "Request denied by policy",
            details: { usage, budget },
          });
        }
        if (usage >= budget) {
          return reply.code(402).send({ error: "Budget exceeded" });
        }
      }
      const apiKey =
        (req.headers["x-openai-key"] as string) || process.env.OPENAI_KEY;
      if (!apiKey) {
        return reply.code(400).send({ error: "Missing OpenAI key" });
      }
      const resp = await fetch("https://api.openai.com/v1/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(req.body),
      });
      const json = await resp.json();
      return reply.code(resp.status).send(json);
    },
  );

  // proxy OpenAI chat completions endpoint
  app.post(
    "/v1/chat/completions",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            model: { type: "string" },
            messages: { type: "array" },
          },
          required: ["model", "messages"],
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
        parameters: [
          {
            in: "header",
            name: "X-Tenant-Id",
            schema: { type: "string" },
            required: false,
            description: "Tenant identifier for budget/rate limiting",
          },
        ],
      },
    },
    async (req, reply) => {
      const tenant = (req.headers["x-tenant-id"] as string) || "public";
      const prisma = await getPrisma();
      for (const period of BUDGET_PERIODS) {
        const key = ledgerKey(period);
        const budget = await readBudget({
          tenant,
          period,
          prisma,
          redis: redisClient,
          defaultBudget: DEFAULT_BUDGET,
        });
        let usage = 0;
        if (redisClient) {
          const cur = await redisClient.get(`ledger:${tenant}:${key}`);
          if (cur) usage = parseFloat(cur);
        }
        const allow = await evaluatePolicy({
          usage,
          budget,
          route: req.routeOptions.url ?? req.url,
          time: new Date().getHours(),
          tenant,
        });
        app.log.info(
          {
            input: {
              usage,
              budget,
              route: req.routeOptions.url ?? req.url,
              tenant,
            },
            allow,
          },
          "policy decision",
        );
        if (!allow) {
          return reply.code(403).send({
            error: "Request denied by policy",
            details: { usage, budget },
          });
        }
        if (usage >= budget) {
          return reply.code(402).send({ error: "Budget exceeded" });
        }
      }
      const apiKey =
        (req.headers["x-openai-key"] as string) || process.env.OPENAI_KEY;
      if (!apiKey) {
        return reply.code(400).send({ error: "Missing OpenAI key" });
      }
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(req.body),
      });
      const json = await resp.json();
      return reply.code(resp.status).send(json);
    },
  );

  const adminAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    const key = req.headers["x-admin-key"] as string | undefined;
    if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  };

  app.post(
    "/admin/tenant",
    {
      preHandler: adminAuth,
      schema: {
        body: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "number" },
              name: { type: "string" },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
        security: [{ AdminApiKey: [] }],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { name } = req.body as { name?: string };
      if (!name) {
        return reply.code(400).send({ error: "Missing name" });
      }
      try {
        const tenant = await prisma.tenant.create({ data: { name } });
        return reply.send(tenant);
      } catch {
        return reply.code(400).send({ error: "Unable to create tenant" });
      }
    },
  );

  app.get(
    "/admin/tenant",
    {
      preHandler: adminAuth,
      schema: {
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "number" },
                name: { type: "string" },
              },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
        security: [{ AdminApiKey: [] }],
      },
    },
    async (_req, reply) => {
      const prisma = await getPrisma();
      const tenants = await prisma.tenant.findMany();
      return reply.send(tenants);
    },
  );

  app.get(
    "/admin/tenant/:tenantId",
    {
      preHandler: adminAuth,
      schema: {
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "number" },
              name: { type: "string" },
            },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
        security: [{ AdminApiKey: [] }],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found" });
      }
      return reply.send(tenant);
    },
  );

  app.post(
    "/admin/tenant/:tenantId/budgets",
    {
      preHandler: adminAuth,
      schema: {
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        body: {
          type: "object",
          properties: {
            budgets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  period: { type: "string" },
                  amountUsd: { type: "number" },
                  startDate: { type: "string" },
                  endDate: { type: "string" },
                },
                required: ["period", "amountUsd"],
              },
            },
          },
          required: ["budgets"],
        },
        response: {
          200: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
        security: [{ AdminApiKey: [] }],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const tenantRec = await prisma.tenant.findUnique({ where: { id } });
      if (!tenantRec) {
        return reply.code(404).send({ error: "Tenant not found" });
      }
      const { budgets } = req.body as {
        budgets?: Array<{
          period: string;
          amountUsd: number;
          startDate?: string;
          endDate?: string;
        }>;
      };
      if (!budgets || !Array.isArray(budgets)) {
        return reply.code(400).send({ error: "Missing budgets" });
      }
      const results = [] as unknown[];
      for (const b of budgets) {
        if (!b.period || b.amountUsd === undefined) continue;
        const existing = await prisma.budget.findFirst({
          where: { tenantId: id, period: b.period },
        });
        const data = {
          tenantId: id,
          period: b.period,
          amountUsd: new Prisma.Decimal(b.amountUsd),
          startDate: b.startDate ? new Date(b.startDate) : undefined,
          endDate: b.endDate ? new Date(b.endDate) : undefined,
        };
        if (existing) {
          const updated = await prisma.budget.update({
            where: { id: existing.id },
            data,
          });
          results.push(updated);
          await writeBudget(
            tenantRec.name,
            updated.period,
            parseFloat(updated.amountUsd.toString()),
            redisClient,
          );
        } else {
          const created = await prisma.budget.create({ data });
          results.push(created);
          await writeBudget(
            tenantRec.name,
            created.period,
            parseFloat(created.amountUsd.toString()),
            redisClient,
          );
        }
      }
      return reply.send(results);
    },
  );

  app.get(
    "/admin/tenant/:tenantId/budgets",
    {
      preHandler: adminAuth,
      schema: {
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        response: {
          200: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
        security: [{ AdminApiKey: [] }],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const budgets = await prisma.budget.findMany({ where: { tenantId: id } });
      return reply.send(budgets);
    },
  );

  app.get(
    "/admin/tenant/:tenantId/usage",
    {
      preHandler: adminAuth,
      schema: {
        params: {
          type: "object",
          properties: { tenantId: { type: "string" } },
          required: ["tenantId"],
        },
        response: {
          200: { type: "object", additionalProperties: { type: "number" } },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
        security: [{ AdminApiKey: [] }],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) return reply.code(404).send({ error: "Tenant not found" });
      const usage: Record<string, number> = {};
      if (!redisClient) {
        return reply.send(usage);
      }
      for (const p of BUDGET_PERIODS) {
        const key = ledgerKey(p);
        const val = await redisClient.get(`ledger:${tenant.name}:${key}`);
        usage[p] = val ? parseFloat(val) : 0;
      }
      return reply.send(usage);
    },
  );

  app.put(
    "/admin/budget/:budgetId",
    {
      preHandler: adminAuth,
      schema: {
        params: {
          type: "object",
          properties: { budgetId: { type: "string" } },
          required: ["budgetId"],
        },
        body: {
          type: "object",
          properties: {
            period: { type: "string" },
            amountUsd: { type: "number" },
            startDate: { type: "string" },
            endDate: { type: "string" },
          },
        },
        response: { 200: { type: "object", additionalProperties: true } },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
        security: [{ AdminApiKey: [] }],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { budgetId } = req.params as { budgetId: string };
      const id = Number(budgetId);
      const data = req.body as Partial<{
        period: string;
        amountUsd: number;
        startDate: string;
        endDate: string;
      }>;
      try {
        const updated = await prisma.budget.update({
          where: { id },
          data: {
            period: data.period,
            amountUsd:
              data.amountUsd !== undefined
                ? new Prisma.Decimal(data.amountUsd)
                : undefined,
            startDate: data.startDate ? new Date(data.startDate) : undefined,
            endDate: data.endDate ? new Date(data.endDate) : undefined,
          },
        });
        const tenantRec = await prisma.tenant.findUnique({
          where: { id: updated.tenantId },
        });
        if (tenantRec) {
          await writeBudget(
            tenantRec.name,
            updated.period,
            parseFloat(updated.amountUsd.toString()),
            redisClient,
          );
        }
        return reply.send(updated);
      } catch {
        return reply.code(404).send({ error: "Budget not found" });
      }
    },
  );

  app.delete(
    "/admin/budget/:budgetId",
    {
      preHandler: adminAuth,
      schema: {
        params: {
          type: "object",
          properties: { budgetId: { type: "string" } },
          required: ["budgetId"],
        },
        response: {
          200: {
            type: "object",
            properties: { ok: { type: "boolean" } },
          },
        },
        parameters: [
          {
            in: "header",
            name: "X-Admin-Key",
            schema: { type: "string" },
            required: true,
            description: "Admin API key from .env",
          },
        ],
        security: [{ AdminApiKey: [] }],
      },
    },
    async (req, reply) => {
      const prisma = await getPrisma();
      const { budgetId } = req.params as { budgetId: string };
      const id = Number(budgetId);
      try {
        const deleted = await prisma.budget.delete({ where: { id } });
        const tenantRec = await prisma.tenant.findUnique({
          where: { id: deleted.tenantId },
        });
        if (tenantRec) {
          await deleteBudget(tenantRec.name, deleted.period, redisClient);
        }
        return reply.send({ ok: true });
      } catch {
        return reply.code(404).send({ error: "Budget not found" });
      }
    },
  );

  return app;
}
