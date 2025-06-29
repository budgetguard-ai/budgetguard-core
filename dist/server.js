import fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config();
export async function buildServer() {
    const app = fastify({ logger: true });
    let redisClient;
    if (process.env.REDIS_URL) {
        redisClient = createClient({ url: process.env.REDIS_URL });
        await redisClient.connect();
    }
    await app.register(rateLimit, {
        client: redisClient,
        max: Number(process.env.MAX_REQS_PER_MIN || 100),
        timeWindow: "1 minute",
        keyGenerator: (req) => req.headers["x-tenant-id"] || "public",
        errorResponseBuilder: () => ({ error: "Rate limit exceeded" }),
    });
    app.setErrorHandler((err, _req, reply) => {
        if (err.error === "Rate limit exceeded") {
            reply.code(429).send({ error: "Rate limit exceeded" });
            return;
        }
        reply.send(err);
    });
    app.get("/health", async () => ({ ok: true }));
    return app;
}
