import fastify, { type FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

export async function buildServer() {
  const app = fastify({ logger: true });

  let redisClient: ReturnType<typeof createClient> | undefined;
  if (process.env.REDIS_URL) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    await redisClient.connect();
  }

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
