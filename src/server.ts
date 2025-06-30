import fastify, { type FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { createClient } from "redis";
import dotenv from "dotenv";
import { countTokensAndCost } from "./token.js";

dotenv.config();

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

  return app;
}
