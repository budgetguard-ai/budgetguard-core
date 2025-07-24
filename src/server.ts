import fastify, {
  type FastifyRequest,
  type FastifyReply,
  type FastifyInstance,
} from "fastify";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { createClient } from "redis";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import { countTokensAndCost } from "./token.js";
import {
  ledgerKey,
  getBudgetPeriods,
  ALLOWED_PERIODS,
  type Period,
} from "./ledger.js";
import { evaluatePolicy } from "./policy/opa.js";
import { readBudget, writeBudget, deleteBudget } from "./budget.js";
import { readRateLimit, writeRateLimit } from "./rate-limit.js";
import type { CompletionRequest } from "./providers/base.js";
import {
  getProviderForModel,
  DatabaseProviderSelector,
  type ProviderType,
} from "./provider-selector.js";

dotenv.config();

const DEFAULT_BUDGET = Number(
  process.env.DEFAULT_BUDGET_USD || process.env.MAX_MONTHLY_USD || 50,
);

const BUDGET_PERIODS = getBudgetPeriods();

export async function buildServer() {
  const app = fastify({
    logger: true,
    ajv: { customOptions: { keywords: ["example"] } },
  });

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
          ApiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key",
            description: "Tenant API key",
          },
          BearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "APIKEY",
            description: "Tenant API key via Authorization header",
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  // Register static file serving for dashboard
  const { fileURLToPath } = await import("url");
  const path = await import("path");
  const fs = await import("fs");
  const fsPromises = fs.promises;

  // Helper function to resolve dashboard dist path
  const resolveDashboardDistPath = async (dirname: string) => {
    const paths = [
      // Development location: src/dashboard/dist
      path.join(dirname, "..", "src", "dashboard", "dist"),
      // Production location: dashboard/dist
      path.join(dirname, "dashboard", "dist"),
    ];

    for (const distPath of paths) {
      try {
        await fsPromises.access(distPath);
        return distPath;
      } catch {
        // Continue to next path
      }
    }

    // Return first path as fallback if none exist
    return paths[0];
  };

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dashboardDistPath = await resolveDashboardDistPath(__dirname);

  // Check if dashboard dist exists
  try {
    await fsPromises.access(dashboardDistPath);
    // Manually handle dashboard assets (JS, CSS, etc.)
    app.get("/dashboard/assets/*", async (req, reply) => {
      const assetPath = req.url.replace("/dashboard/", "");
      const fullPath = path.join(dashboardDistPath, assetPath);

      try {
        await fsPromises.access(fullPath);
        const content = await fsPromises.readFile(fullPath);

        // Set appropriate content type
        if (fullPath.endsWith(".js")) {
          reply.type("application/javascript");
        } else if (fullPath.endsWith(".css")) {
          reply.type("text/css");
        } else if (fullPath.endsWith(".png")) {
          reply.type("image/png");
        } else if (fullPath.endsWith(".svg")) {
          reply.type("image/svg+xml");
        }

        return reply.send(content);
      } catch {
        return reply.code(404).send({ error: "Asset not found" });
      }
    });

    // Serve dashboard SPA for main route and all subroutes
    const serveDashboardSPA = async (
      req: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const indexPath = path.join(dashboardDistPath, "index.html");
      try {
        const indexContent = await fsPromises.readFile(indexPath, "utf8");
        reply.type("text/html").send(indexContent);
      } catch {
        reply.code(404).send({ error: "Dashboard not built" });
      }
    };

    app.get("/dashboard", serveDashboardSPA);
    app.get("/dashboard/*", async (req, reply) => {
      // Skip asset requests - they're handled above
      if (req.url.includes("/assets/")) {
        return;
      }

      // Serve SPA for all other dashboard routes
      await serveDashboardSPA(req, reply);
    });
  } catch {
    // Dashboard dist doesn't exist
    // If dashboard not built, show helpful message
    app.get("/dashboard", async (req, reply) => {
      reply.code(404).send({
        error: "Dashboard not built",
        message: "Run 'npm run build:dashboard' to build the dashboard first",
      });
    });
  }

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

  // Define types for OpenAI response
  type OpenAIChoice = { text?: string; message?: { content?: string } };
  type OpenAIResponse = {
    choices?: OpenAIChoice[];
    model?: string;
    error?: unknown;
  };

  app.addHook("onSend", async (req, _reply, payload) => {
    if (!redisClient) return payload;

    const route = req.routeOptions.url ?? req.url;
    if (route !== "/v1/chat/completions" && route !== "/v1/responses") {
      return payload;
    }

    const statusCode = _reply.statusCode;
    let resp: Record<string, unknown> | string;
    try {
      resp = typeof payload === "string" ? JSON.parse(payload) : payload;
    } catch {
      resp = payload as string | Record<string, unknown>;
    }

    // Only increment usage if status is 200 and no error in response
    if (
      statusCode !== 200 ||
      (resp && (resp as Record<string, unknown>).error)
    ) {
      return payload;
    }

    let usd = 0;
    let promptTok = 0;
    let compTok = 0;

    try {
      const body = req.body as Record<string, unknown> | undefined;
      const model =
        (body?.model as string) ||
        (typeof resp === "object" && resp !== null && "model" in resp
          ? (resp as OpenAIResponse).model
          : undefined);

      let completion: string | undefined = undefined;
      let actualUsage:
        | {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
          }
        | undefined = undefined;

      if (typeof resp === "object" && resp !== null && "choices" in resp) {
        const choices = (resp as OpenAIResponse).choices ?? [];
        if (choices.length > 0) {
          completion = choices[0]?.text ?? choices[0]?.message?.content;
        }
      }

      // Extract provider-reported usage tokens if available
      if (typeof resp === "object" && resp !== null && "usage" in resp) {
        const usage = (resp as { usage: unknown }).usage;
        if (usage && typeof usage === "object" && usage !== null) {
          const usageObj = usage as Record<string, unknown>;
          actualUsage = {
            promptTokens: Number(usageObj.prompt_tokens) || 0,
            completionTokens: Number(usageObj.completion_tokens) || 0,
            totalTokens: Number(usageObj.total_tokens) || 0,
          };
        }
      }

      if (model && (body?.prompt || body?.messages || body?.input)) {
        const prismaClient = await getPrisma();
        const {
          promptTokens,
          completionTokens,
          usd: cost,
        } = await countTokensAndCost(
          {
            model,
            prompt:
              (body?.prompt as string) ||
              ((body?.messages as Array<{ role: string; content: string }>) ??
                []) ||
              (body?.input as string),
            completion,
            actualUsage, // Pass provider-reported usage if available
          },
          prismaClient,
        );
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
    const prismaClient = await getPrisma();
    for (const period of BUDGET_PERIODS) {
      const { startDate, endDate } = await readBudget({
        tenant,
        period,
        prisma: prismaClient,
        redis: redisClient,
        defaultBudget: DEFAULT_BUDGET,
      });
      const now = new Date();
      if (now < startDate || now > endDate) continue;
      const key = ledgerKey(period, now, { startDate, endDate });
      await redisClient.incrByFloat(`ledger:${tenant}:${key}`, usd);
    }
    return payload;
  });

  await app.register(
    rateLimit as unknown as (
      instance: FastifyInstance,
      opts: Record<string, unknown>,
      done: (err?: Error) => void,
    ) => void,
    {
      client: redisClient,
      max: async (req: FastifyRequest) => {
        const tenant = (req.headers["x-tenant-id"] as string) || "public";
        const prismaClient = await getPrisma();
        const limit = await readRateLimit({
          tenant,
          prisma: prismaClient,
          redis: redisClient,
          defaultLimit: Number(process.env.MAX_REQS_PER_MIN || 100),
        });
        return limit === 0 ? Number.MAX_SAFE_INTEGER : limit;
      },
      timeWindow: "1 minute",
      keyGenerator: (req: FastifyRequest) =>
        (req.headers["x-tenant-id"] as string) || "public",
      errorResponseBuilder: () => ({ error: "Rate limit exceeded" }),
    },
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
            properties: {
              ok: { type: "boolean" },
              dependencies: {
                type: "object",
                properties: {
                  database: { type: "boolean" },
                  redis: { type: "boolean" },
                  providers: {
                    type: "object",
                    properties: {
                      configured: { type: "number" },
                      healthy: { type: "number" },
                    },
                  },
                },
              },
            },
            required: ["ok"],
          },
        },
      },
    },
    async () => {
      const health = {
        ok: true,
        dependencies: {
          database: false,
          redis: false,
          providers: {
            configured: 0,
            healthy: 0,
          },
        },
      };

      try {
        // Check database connectivity
        const prisma = await getPrisma();
        await prisma.$queryRaw`SELECT 1`;
        health.dependencies.database = true;
      } catch {
        health.ok = false;
      }

      try {
        // Check Redis connectivity (if configured)
        if (process.env.REDIS_URL) {
          const redis = createClient({ url: process.env.REDIS_URL });
          await redis.connect();
          await redis.ping();
          await redis.disconnect();
          health.dependencies.redis = true;
        } else {
          health.dependencies.redis = true; // Not required if not configured
        }
      } catch {
        health.ok = false;
      }

      try {
        // Check provider status (quick check)
        const config = {
          openaiApiKey: process.env.OPENAI_KEY,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
          googleApiKey: process.env.GOOGLE_API_KEY,
        };

        const prisma = await getPrisma();
        const providerSelector = new DatabaseProviderSelector(prisma, config);
        const providers = providerSelector.getAllConfiguredProviders();

        health.dependencies.providers.configured =
          Object.keys(providers).length;

        // Quick concurrent health checks (with timeout)
        const healthChecks = await Promise.allSettled(
          Object.values(providers).map(async (provider) => {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Health check timeout")), 3000),
            );
            return Promise.race([provider.healthCheck(), timeoutPromise]);
          }),
        );

        health.dependencies.providers.healthy = healthChecks.filter(
          (result) =>
            result.status === "fulfilled" &&
            typeof result.value === "object" &&
            result.value !== null &&
            "healthy" in result.value &&
            (result.value as { healthy: boolean }).healthy,
        ).length;
      } catch {
        // Provider checks are not critical for overall health
      }

      return health;
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
          {
            in: "header",
            name: "Authorization",
            schema: { type: "string" },
            required: false,
            description: "Bearer <API_KEY>",
          },
          {
            in: "header",
            name: "X-OpenAI-Key",
            schema: { type: "string" },
            required: false,
            description: "OpenAI API key for OpenAI models",
          },
          {
            in: "header",
            name: "X-Anthropic-Key",
            schema: { type: "string" },
            required: false,
            description: "Anthropic API key for Claude models",
          },
          {
            in: "header",
            name: "X-API-Key",
            schema: { type: "string" },
            required: false,
            description: "Tenant API key",
          },
        ],
        security: [{}, { ApiKeyAuth: [] }, { BearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const startDecision = process.hrtime.bigint();
      const prisma = await getPrisma();
      let tenant = (req.headers["x-tenant-id"] as string) || "public";
      let supplied: string | undefined;
      const auth = req.headers.authorization as string | undefined;
      if (auth && auth.startsWith("Bearer ")) supplied = auth.slice(7);
      if (!supplied && req.headers["x-api-key"]) {
        supplied = req.headers["x-api-key"] as string;
      }
      if (supplied) {
        const keyRec = await prisma.apiKey.findFirst({
          where: { key: supplied, isActive: true },
        });
        if (!keyRec) {
          return reply.code(401).send({ error: "Unauthorized" });
        }
        const tenantRec = await prisma.tenant.findUnique({
          where: { id: keyRec.tenantId },
        });
        if (!tenantRec) {
          return reply.code(401).send({ error: "Unauthorized" });
        }
        tenant = tenantRec.name;
        (req.headers as Record<string, string>)["x-tenant-id"] = tenant;
        await prisma.apiKey.update({
          where: { id: keyRec.id },
          data: { lastUsedAt: new Date() },
        });
        await prisma.auditLog
          .create({
            data: {
              tenantId: keyRec.tenantId,
              actor: `apiKey:${keyRec.id}`,
              event: "api_key_used",
              details: req.routeOptions.url ?? req.url,
            },
          })
          .catch(() => {});
      }
      const budgets = [] as Array<{
        period: string;
        usage: number;
        budget: number;
        start: string;
        end: string;
      }>;
      for (const period of BUDGET_PERIODS) {
        const { amount, startDate, endDate } = await readBudget({
          tenant,
          period,
          prisma,
          redis: redisClient,
          defaultBudget: DEFAULT_BUDGET,
        });
        const now = new Date();
        if (now < startDate || now > endDate) continue;
        const key = ledgerKey(period, now, { startDate, endDate });
        let usage = 0;
        if (redisClient) {
          const cur = await redisClient.get(`ledger:${tenant}:${key}`);
          if (cur) usage = parseFloat(cur);
        }
        budgets.push({
          period,
          usage,
          budget: amount,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        });
      }
      const input = {
        tenant,
        route: req.routeOptions.url ?? req.url,
        time: new Date().getHours(),
        budgets,
      };
      const allow = await evaluatePolicy(input);
      app.log.info({ input, allow }, "policy decision");
      if (!allow) {
        const decisionMs =
          Number(process.hrtime.bigint() - startDecision) / 1e6;
        for (const b of budgets) {
          app.log.warn({ period: b.period, usage: b.usage, budget: b.budget });
        }
        app.log.warn({ decisionMs }, "policy denied");
        return reply.code(403).send({ error: "Request denied by policy" });
      }
      for (const b of budgets) {
        if (b.usage >= b.budget) {
          const decisionMs =
            Number(process.hrtime.bigint() - startDecision) / 1e6;
          app.log.warn({
            period: b.period,
            usage: b.usage,
            budget: b.budget,
            decisionMs,
          });
          return reply.code(402).send({ error: "Budget exceeded" });
        }
      }
      const decisionMs = Number(process.hrtime.bigint() - startDecision) / 1e6;
      app.log.info({ decisionMs }, "allow request");

      const body = req.body as CompletionRequest;
      const model = body.model;

      const provider = await getProviderForModel(model, await getPrisma(), {
        openaiApiKey:
          (req.headers["x-openai-key"] as string) || process.env.OPENAI_KEY,
        anthropicApiKey:
          (req.headers["x-anthropic-key"] as string) ||
          process.env.ANTHROPIC_API_KEY,
        googleApiKey:
          (req.headers["x-google-api-key"] as string) ||
          process.env.GOOGLE_API_KEY,
      });

      if (!provider) {
        return reply
          .code(400)
          .send({ error: `No provider configured for model: ${model}` });
      }

      const result = await provider.chatCompletion(body);
      return reply.code(result.status).send(result.data);
    },
  );

  // proxy OpenAI responses endpoint
  app.post(
    "/v1/responses",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            model: { type: "string" },
          },
          required: ["model"],
          additionalProperties: true,
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
          {
            in: "header",
            name: "Authorization",
            schema: { type: "string" },
            required: false,
            description: "Bearer <API_KEY>",
          },
          {
            in: "header",
            name: "X-OpenAI-Key",
            schema: { type: "string" },
            required: false,
            description: "OpenAI API key for OpenAI models",
          },
          {
            in: "header",
            name: "X-Anthropic-Key",
            schema: { type: "string" },
            required: false,
            description: "Anthropic API key for Claude models",
          },
          {
            in: "header",
            name: "X-API-Key",
            schema: { type: "string" },
            required: false,
            description: "Tenant API key",
          },
        ],
        security: [{}, { ApiKeyAuth: [] }],
      },
    },
    async (req, reply) => {
      const startDecision = process.hrtime.bigint();
      const prisma = await getPrisma();
      let tenant = (req.headers["x-tenant-id"] as string) || "public";
      let supplied: string | undefined;
      if (req.headers["x-api-key"]) {
        supplied = req.headers["x-api-key"] as string;
      }
      if (supplied) {
        const keyRec = await prisma.apiKey.findFirst({
          where: { key: supplied, isActive: true },
        });
        if (!keyRec) {
          return reply.code(401).send({ error: "Unauthorized" });
        }
        const tenantRec = await prisma.tenant.findUnique({
          where: { id: keyRec.tenantId },
        });
        if (!tenantRec) {
          return reply.code(401).send({ error: "Unauthorized" });
        }
        tenant = tenantRec.name;
        (req.headers as Record<string, string>)["x-tenant-id"] = tenant;
        await prisma.apiKey.update({
          where: { id: keyRec.id },
          data: { lastUsedAt: new Date() },
        });
        await prisma.auditLog
          .create({
            data: {
              tenantId: keyRec.tenantId,
              actor: `apiKey:${keyRec.id}`,
              event: "api_key_used",
              details: req.routeOptions.url ?? req.url,
            },
          })
          .catch(() => {});
      }
      const budgets = [] as Array<{
        period: string;
        usage: number;
        budget: number;
        start: string;
        end: string;
      }>;
      for (const period of BUDGET_PERIODS) {
        const { amount, startDate, endDate } = await readBudget({
          tenant,
          period,
          prisma,
          redis: redisClient,
          defaultBudget: DEFAULT_BUDGET,
        });
        const now = new Date();
        if (now < startDate || now > endDate) continue;
        const key = ledgerKey(period, now, { startDate, endDate });
        let usage = 0;
        if (redisClient) {
          const cur = await redisClient.get(`ledger:${tenant}:${key}`);
          if (cur) usage = parseFloat(cur);
        }
        budgets.push({
          period,
          usage,
          budget: amount,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        });
      }
      const input = {
        tenant,
        route: req.routeOptions.url ?? req.url,
        time: new Date().getHours(),
        budgets,
      };
      const allow = await evaluatePolicy(input);
      app.log.info({ input, allow }, "policy decision");
      if (!allow) {
        const decisionMs =
          Number(process.hrtime.bigint() - startDecision) / 1e6;
        for (const b of budgets) {
          app.log.warn({ period: b.period, usage: b.usage, budget: b.budget });
        }
        app.log.warn({ decisionMs }, "policy denied");
        return reply.code(403).send({ error: "Request denied by policy" });
      }
      for (const b of budgets) {
        if (b.usage >= b.budget) {
          const decisionMs =
            Number(process.hrtime.bigint() - startDecision) / 1e6;
          app.log.warn({
            period: b.period,
            usage: b.usage,
            budget: b.budget,
            decisionMs,
          });
          return reply.code(402).send({ error: "Budget exceeded" });
        }
      }
      const decisionMs = Number(process.hrtime.bigint() - startDecision) / 1e6;
      app.log.info({ decisionMs }, "allow request");

      const body = req.body as CompletionRequest;
      const model = body.model;

      const provider = await getProviderForModel(model, await getPrisma(), {
        openaiApiKey:
          (req.headers["x-openai-key"] as string) || process.env.OPENAI_KEY,
        anthropicApiKey:
          (req.headers["x-anthropic-key"] as string) ||
          process.env.ANTHROPIC_API_KEY,
        googleApiKey:
          (req.headers["x-google-api-key"] as string) ||
          process.env.GOOGLE_API_KEY,
      });

      if (!provider) {
        return reply
          .code(400)
          .send({ error: `No provider configured for model: ${model}` });
      }

      const result = await provider.responses(body);
      return reply.code(result.status).send(result.data);
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
        const tenant = await prisma.tenant.create({
          data: {
            name,
            rateLimitPerMin: Number(process.env.MAX_REQS_PER_MIN || 100),
          },
        });
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

  app.put(
    "/admin/tenant/:tenantId",
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
            name: { type: "string" },
            rateLimitPerMin: { type: "number", nullable: true },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "number" },
              name: { type: "string" },
              rateLimitPerMin: { type: "number", nullable: true },
              createdAt: { type: "string" },
              updatedAt: { type: "string" },
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
      const { name, rateLimitPerMin } = req.body as {
        name?: string;
        rateLimitPerMin?: number | null;
      };

      // Check if tenant exists
      const existingTenant = await prisma.tenant.findUnique({ where: { id } });
      if (!existingTenant) {
        return reply.code(404).send({ error: "Tenant not found" });
      }

      // Validate name if provided
      if (name !== undefined && (!name || name.trim().length === 0)) {
        return reply.code(400).send({ error: "Name cannot be empty" });
      }

      try {
        const updateData: { name?: string; rateLimitPerMin?: number | null } =
          {};
        if (name !== undefined) updateData.name = name.trim();
        if (rateLimitPerMin !== undefined)
          updateData.rateLimitPerMin = rateLimitPerMin;

        const updatedTenant = await prisma.tenant.update({
          where: { id },
          data: updateData,
        });

        // Update rate limit cache if rate limit was changed
        if (rateLimitPerMin !== undefined) {
          await writeRateLimit(
            updatedTenant.name,
            updatedTenant.rateLimitPerMin ??
              Number(process.env.MAX_REQS_PER_MIN || 100),
            redisClient,
          );
        }

        return reply.send(updatedTenant);
      } catch (error) {
        app.log.error(error, "Error updating tenant");
        return reply.code(400).send({ error: "Unable to update tenant" });
      }
    },
  );

  app.delete(
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
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);

      // Check if tenant exists
      const existingTenant = await prisma.tenant.findUnique({ where: { id } });
      if (!existingTenant) {
        return reply.code(404).send({ error: "Tenant not found" });
      }

      try {
        // Use transaction to ensure all related data is deleted consistently
        await prisma.$transaction(async (tx) => {
          // Delete related records in correct order to handle foreign key constraints
          await tx.auditLog.deleteMany({ where: { tenantId: id } });
          await tx.usageLedger.deleteMany({ where: { tenantId: id } });
          await tx.apiKey.deleteMany({ where: { tenantId: id } });
          await tx.budget.deleteMany({ where: { tenantId: id } });

          // Finally delete the tenant
          await tx.tenant.delete({ where: { id } });
        });

        // Clean up Redis cache
        if (redisClient) {
          try {
            // Delete rate limit cache
            await redisClient.del(`ratelimit:${existingTenant.name}`);

            // Delete budget cache for all periods
            for (const period of BUDGET_PERIODS) {
              await redisClient.del(`budget:${existingTenant.name}:${period}`);
            }

            // Delete usage ledger cache (pattern match and delete)
            const ledgerKeys = await redisClient.keys(
              `ledger:${existingTenant.name}:*`,
            );
            if (ledgerKeys.length > 0) {
              await (redisClient.del as (...keys: string[]) => Promise<number>)(
                ...ledgerKeys,
              );
            }
          } catch (redisError) {
            app.log.warn(
              redisError,
              "Error cleaning up Redis cache for deleted tenant",
            );
            // Don't fail the request if Redis cleanup fails
          }
        }

        return reply.send({ ok: true });
      } catch (error) {
        app.log.error(error, "Error deleting tenant");
        return reply.code(400).send({ error: "Unable to delete tenant" });
      }
    },
  );

  app.get(
    "/admin/tenant/:tenantId/ratelimit",
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
            properties: { rateLimitPerMin: { type: "number", nullable: true } },
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
      if (!tenant) return reply.code(404).send({ error: "Tenant not found" });
      return reply.send({ rateLimitPerMin: tenant.rateLimitPerMin ?? null });
    },
  );

  app.put(
    "/admin/tenant/:tenantId/ratelimit",
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
            rateLimitPerMin: { oneOf: [{ type: "number" }, { type: "null" }] },
          },
          required: ["rateLimitPerMin"],
        },
        response: {
          200: {
            type: "object",
            properties: { rateLimitPerMin: { type: "number", nullable: true } },
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
      const { rateLimitPerMin } = req.body as {
        rateLimitPerMin: number | null;
      };
      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) return reply.code(404).send({ error: "Tenant not found" });
      const updated = await prisma.tenant.update({
        where: { id },
        data: { rateLimitPerMin: rateLimitPerMin },
      });
      await writeRateLimit(
        tenant.name,
        updated.rateLimitPerMin ?? Number(process.env.MAX_REQS_PER_MIN || 100),
        redisClient,
      );
      return reply.send({ rateLimitPerMin: updated.rateLimitPerMin ?? null });
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
        if (!ALLOWED_PERIODS.includes(b.period as Period)) {
          return reply
            .code(400)
            .send({ error: "Invalid period. Allowed: daily, monthly, custom" });
        }
        let startDate: Date | undefined;
        let endDate: Date | undefined;
        const now = new Date();
        if (b.period === "monthly") {
          startDate = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
          );
          endDate = new Date(
            Date.UTC(
              now.getUTCFullYear(),
              now.getUTCMonth() + 1,
              0,
              23,
              59,
              59,
              999,
            ),
          );
        } else if (b.period === "daily") {
          startDate = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
          );
          endDate = new Date(startDate.getTime() + 86400000 - 1);
        } else if (b.period === "custom") {
          if (
            !b.startDate ||
            !b.endDate ||
            isNaN(new Date(b.startDate).getTime()) ||
            isNaN(new Date(b.endDate).getTime())
          ) {
            return reply.code(400).send({
              error: "Custom period requires valid startDate and endDate",
            });
          }
          // Set start to 00:00:00.000 and end to 23:59:59.999 for the end date
          startDate = new Date(b.startDate);
          endDate = new Date(b.endDate);
          endDate.setUTCHours(23, 59, 59, 999);
        }
        if (endDate && startDate && endDate < startDate) {
          return reply
            .code(400)
            .send({ error: "endDate must be equal to or after startDate" });
        }
        const existing = await prisma.budget.findFirst({
          where: { tenantId: id, period: b.period },
        });
        const data = {
          tenantId: id,
          period: b.period,
          amountUsd: b.amountUsd,
          startDate,
          endDate,
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
            startDate!,
            endDate!,
            redisClient,
          );
        } else {
          const created = await prisma.budget.create({ data });
          results.push(created);
          await writeBudget(
            tenantRec.name,
            created.period,
            parseFloat(created.amountUsd.toString()),
            startDate!,
            endDate!,
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

  app.post(
    "/admin/tenant/:tenantId/apikeys",
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
              key: { type: "string" },
              createdAt: { type: "string" },
              isActive: { type: "boolean" },
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
      if (!tenant) return reply.code(404).send({ error: "Tenant not found" });
      const key = randomBytes(32).toString("hex");
      const rec = await prisma.apiKey.create({
        data: { key, tenantId: id, isActive: true },
      });
      return reply.send({
        id: rec.id,
        key: rec.key,
        createdAt: rec.createdAt,
        isActive: rec.isActive,
      });
    },
  );

  app.get(
    "/admin/tenant/:tenantId/apikeys",
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
            items: {
              type: "object",
              properties: {
                id: { type: "number" },
                createdAt: { type: "string" },
                isActive: { type: "boolean" },
                lastUsedAt: { type: "string", nullable: true },
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
    async (req, reply) => {
      const prisma = await getPrisma();
      const { tenantId } = req.params as { tenantId: string };
      const id = Number(tenantId);
      const list = await prisma.apiKey.findMany({ where: { tenantId: id } });
      return reply.send(
        list.map((k) => ({
          id: k.id,
          createdAt: k.createdAt,
          isActive: k.isActive,
          lastUsedAt: k.lastUsedAt ?? undefined,
        })),
      );
    },
  );

  app.delete(
    "/admin/apikey/:id",
    {
      preHandler: adminAuth,
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: {
          200: { type: "object", properties: { ok: { type: "boolean" } } },
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
      const { id } = req.params as { id: string };
      await prisma.apiKey.update({
        where: { id: Number(id) },
        data: { isActive: false },
      });
      return reply.send({ ok: true });
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
        const { startDate, endDate } = await readBudget({
          tenant: tenant.name,
          period: p,
          prisma,
          redis: redisClient,
          defaultBudget: DEFAULT_BUDGET,
        });
        const key = ledgerKey(p, new Date(), { startDate, endDate });
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
        let startDate: Date | undefined = data.startDate
          ? new Date(data.startDate)
          : undefined;
        let endDate: Date | undefined = data.endDate
          ? new Date(data.endDate)
          : undefined;
        if (data.period === "monthly") {
          const now = new Date();
          startDate = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
          );
          endDate = new Date(
            Date.UTC(
              now.getUTCFullYear(),
              now.getUTCMonth() + 1,
              0,
              23,
              59,
              59,
              999,
            ),
          );
        } else if (data.period === "daily") {
          const now = new Date();
          startDate = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
          );
          endDate = new Date(startDate.getTime() + 86400000 - 1);
        } else if (data.period === "custom" && (!startDate || !endDate)) {
          throw new Error("custom period requires dates");
        }
        const updated = await prisma.budget.update({
          where: { id },
          data: {
            period: data.period,
            amountUsd: data.amountUsd,
            startDate,
            endDate,
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
            updated.startDate!,
            updated.endDate!,
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

  app.get(
    "/admin/model-pricing",
    {
      preHandler: adminAuth,
      schema: {
        response: {
          200: {
            type: "array",
            items: { type: "object", additionalProperties: true },
            example: [
              {
                id: 1,
                model: "gpt-4.1",
                versionTag: "gpt-4.1-2025-04-14",
                inputPrice: "2.00",
                cachedInputPrice: "0.50",
                outputPrice: "8.00",
                provider: "openai",
                createdAt: "2025-04-14T00:00:00.000Z",
                updatedAt: "2025-04-14T00:00:00.000Z",
              },
            ],
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
      const rows = await prisma.modelPricing.findMany();
      return reply.send(rows);
    },
  );

  app.post(
    "/admin/model-pricing",
    {
      preHandler: adminAuth,
      schema: {
        body: {
          type: "object",
          properties: {
            model: { type: "string" },
            versionTag: { type: "string" },
            inputPrice: { type: "number" },
            cachedInputPrice: { type: "number" },
            outputPrice: { type: "number" },
            provider: { type: "string" },
          },
          required: [
            "model",
            "versionTag",
            "inputPrice",
            "cachedInputPrice",
            "outputPrice",
          ],
          example: {
            model: "gpt-4.1",
            versionTag: "gpt-4.1-2025-04-14",
            inputPrice: 2.0,
            cachedInputPrice: 0.5,
            outputPrice: 8.0,
            provider: "openai",
          },
        },
        response: {
          200: { type: "object", additionalProperties: true },
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
      const body = req.body as {
        model: string;
        versionTag: string;
        inputPrice: number;
        cachedInputPrice: number;
        outputPrice: number;
        provider?: string;
      };
      try {
        const rec = await prisma.modelPricing.create({
          data: {
            model: body.model,
            versionTag: body.versionTag,
            inputPrice: body.inputPrice,
            cachedInputPrice: body.cachedInputPrice,
            outputPrice: body.outputPrice,
            provider: body.provider || "openai",
          },
        });
        return reply.send(rec);
      } catch {
        return reply
          .code(400)
          .send({ error: "Unable to create model pricing" });
      }
    },
  );

  app.put(
    "/admin/model-pricing/:idOrModel",
    {
      preHandler: adminAuth,
      schema: {
        params: {
          type: "object",
          properties: { idOrModel: { type: "string" } },
          required: ["idOrModel"],
        },
        body: {
          type: "object",
          properties: {
            model: { type: "string" },
            versionTag: { type: "string" },
            inputPrice: { type: "number" },
            cachedInputPrice: { type: "number" },
            outputPrice: { type: "number" },
            provider: { type: "string" },
          },
          example: { outputPrice: 25 },
        },
        response: {
          200: { type: "object", additionalProperties: true },
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
      const { idOrModel } = req.params as { idOrModel: string };
      const data = req.body as Partial<{
        model: string;
        versionTag: string;
        inputPrice: number;
        cachedInputPrice: number;
        outputPrice: number;
        provider: string;
      }>;
      const where = /^[0-9]+$/.test(idOrModel)
        ? { id: Number(idOrModel) }
        : { model: idOrModel };
      try {
        const updated = await prisma.modelPricing.update({ where, data });
        return reply.send(updated);
      } catch {
        return reply.code(404).send({ error: "Model pricing not found" });
      }
    },
  );

  // Provider status endpoints
  app.get(
    "/admin/providers/status",
    {
      preHandler: adminAuth,
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              providers: {
                type: "object",
                properties: {
                  openai: {
                    type: "object",
                    properties: {
                      configured: { type: "boolean" },
                      healthy: { type: "boolean" },
                      responseTime: { type: "number" },
                      error: { type: "string" },
                      lastChecked: { type: "number" },
                    },
                  },
                  anthropic: {
                    type: "object",
                    properties: {
                      configured: { type: "boolean" },
                      healthy: { type: "boolean" },
                      responseTime: { type: "number" },
                      error: { type: "string" },
                      lastChecked: { type: "number" },
                    },
                  },
                  google: {
                    type: "object",
                    properties: {
                      configured: { type: "boolean" },
                      healthy: { type: "boolean" },
                      responseTime: { type: "number" },
                      error: { type: "string" },
                      lastChecked: { type: "number" },
                    },
                  },
                },
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
    async (req, reply) => {
      try {
        const config = {
          openaiApiKey:
            (req.headers["x-openai-key"] as string) || process.env.OPENAI_KEY,
          anthropicApiKey:
            (req.headers["x-anthropic-key"] as string) ||
            process.env.ANTHROPIC_API_KEY,
          googleApiKey:
            (req.headers["x-google-api-key"] as string) ||
            process.env.GOOGLE_API_KEY,
        };

        const prisma = await getPrisma();
        const providerSelector = new DatabaseProviderSelector(prisma, config);
        const providers = providerSelector.getAllConfiguredProviders();

        const status: {
          providers: Record<
            string,
            {
              configured: boolean;
              healthy: boolean;
              responseTime?: number;
              error?: string;
              lastChecked: number;
            }
          >;
        } = {
          providers: {},
        };

        // Check each provider type
        for (const providerType of [
          "openai",
          "anthropic",
          "google",
        ] as ProviderType[]) {
          const provider = providers[providerType];
          const configured = provider !== undefined;

          if (configured && provider) {
            try {
              const health = await provider.healthCheck();
              status.providers[providerType] = {
                configured: true,
                ...health,
              };
            } catch (error) {
              status.providers[providerType] = {
                configured: true,
                healthy: false,
                error: error instanceof Error ? error.message : "Unknown error",
                lastChecked: Date.now(),
              };
            }
          } else {
            status.providers[providerType] = {
              configured: false,
              healthy: false,
              error: "Provider not configured",
              lastChecked: Date.now(),
            };
          }
        }

        return reply.send(status);
      } catch (error) {
        return reply.code(500).send({
          error:
            error instanceof Error
              ? error.message
              : "Failed to check provider status",
        });
      }
    },
  );

  app.get(
    "/admin/providers/:provider/health",
    {
      preHandler: adminAuth,
      schema: {
        params: {
          type: "object",
          properties: {
            provider: {
              type: "string",
              enum: ["openai", "anthropic", "google"],
            },
          },
          required: ["provider"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              provider: { type: "string" },
              configured: { type: "boolean" },
              healthy: { type: "boolean" },
              responseTime: { type: "number" },
              error: { type: "string" },
              lastChecked: { type: "number" },
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
      try {
        const { provider: providerType } = req.params as {
          provider: ProviderType;
        };

        const config = {
          openaiApiKey:
            (req.headers["x-openai-key"] as string) || process.env.OPENAI_KEY,
          anthropicApiKey:
            (req.headers["x-anthropic-key"] as string) ||
            process.env.ANTHROPIC_API_KEY,
          googleApiKey:
            (req.headers["x-google-api-key"] as string) ||
            process.env.GOOGLE_API_KEY,
        };

        const prisma = await getPrisma();
        const providerSelector = new DatabaseProviderSelector(prisma, config);
        const provider = providerSelector.getProviderByType(providerType);

        if (!provider) {
          return reply.send({
            provider: providerType,
            configured: false,
            healthy: false,
            error: "Provider not configured",
            lastChecked: Date.now(),
          });
        }

        try {
          const health = await provider.healthCheck();
          return reply.send({
            provider: providerType,
            configured: true,
            ...health,
          });
        } catch (error) {
          return reply.send({
            provider: providerType,
            configured: true,
            healthy: false,
            error: error instanceof Error ? error.message : "Unknown error",
            lastChecked: Date.now(),
          });
        }
      } catch (error) {
        return reply.code(500).send({
          error:
            error instanceof Error
              ? error.message
              : "Failed to check provider health",
        });
      }
    },
  );

  app.post(
    "/admin/providers/:provider/test",
    {
      preHandler: adminAuth,
      schema: {
        params: {
          type: "object",
          properties: {
            provider: {
              type: "string",
              enum: ["openai", "anthropic", "google"],
            },
          },
          required: ["provider"],
        },
        body: {
          type: "object",
          properties: {
            apiKey: { type: "string" },
          },
          required: ["apiKey"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              provider: { type: "string" },
              healthy: { type: "boolean" },
              responseTime: { type: "number" },
              error: { type: "string" },
              lastChecked: { type: "number" },
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
      try {
        const { provider: providerType } = req.params as {
          provider: ProviderType;
        };
        const { apiKey } = req.body as { apiKey: string };

        // Create a temporary provider instance with the provided API key
        let provider;
        switch (providerType) {
          case "openai": {
            const { OpenAIProvider } = await import("./providers/openai.js");
            provider = new OpenAIProvider({ apiKey });
            break;
          }
          case "anthropic": {
            const { AnthropicProvider } = await import(
              "./providers/anthropic.js"
            );
            provider = new AnthropicProvider({ apiKey });
            break;
          }
          case "google": {
            const { GoogleProvider } = await import("./providers/google.js");
            provider = new GoogleProvider({ apiKey });
            break;
          }
          default:
            return reply.code(400).send({ error: "Invalid provider type" });
        }

        try {
          const health = await provider.healthCheck();
          return reply.send({
            provider: providerType,
            ...health,
          });
        } catch (error) {
          return reply.send({
            provider: providerType,
            healthy: false,
            error: error instanceof Error ? error.message : "Unknown error",
            lastChecked: Date.now(),
          });
        }
      } catch (error) {
        return reply.code(500).send({
          error:
            error instanceof Error ? error.message : "Failed to test provider",
        });
      }
    },
  );

  return app;
}
