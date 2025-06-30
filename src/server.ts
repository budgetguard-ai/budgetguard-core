import fastify, { type FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { createClient } from "redis";
import dotenv from "dotenv";
import { countTokensAndCost } from "./token.js";
import { ledgerKey, getBudgetPeriods } from "./ledger.js";

dotenv.config();

const DEFAULT_BUDGET = Number(
  process.env.DEFAULT_BUDGET_USD || process.env.MAX_MONTHLY_USD || 50,
);

const BUDGET_PERIODS = getBudgetPeriods();

export async function buildServer() {
  const app = fastify({ logger: true });

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

  app.get("/health", async () => ({ ok: true }));

  // proxy OpenAI completions endpoint
  app.post("/v1/completions", async (req, reply) => {
    const tenant = (req.headers["x-tenant-id"] as string) || "public";
    for (const period of BUDGET_PERIODS) {
      const key = ledgerKey(period);
      const budget = Number(
        process.env[`BUDGET_${period.toUpperCase()}_${tenant.toUpperCase()}`] ??
          process.env[`BUDGET_${period.toUpperCase()}_USD`] ??
          DEFAULT_BUDGET,
      );
      let usage = 0;
      if (redisClient) {
        const cur = await redisClient.get(`ledger:${tenant}:${key}`);
        if (cur) usage = parseFloat(cur);
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
  });

  // proxy OpenAI chat completions endpoint
  app.post("/v1/chat/completions", async (req, reply) => {
    const tenant = (req.headers["x-tenant-id"] as string) || "public";
    for (const period of BUDGET_PERIODS) {
      const key = ledgerKey(period);
      const budget = Number(
        process.env[`BUDGET_${period.toUpperCase()}_${tenant.toUpperCase()}`] ??
          process.env[`BUDGET_${period.toUpperCase()}_USD`] ??
          DEFAULT_BUDGET,
      );
      let usage = 0;
      if (redisClient) {
        const cur = await redisClient.get(`ledger:${tenant}:${key}`);
        if (cur) usage = parseFloat(cur);
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
  });

  return app;
}
