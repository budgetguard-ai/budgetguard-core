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
    app.addHook("onSend", async (req, _reply, payload) => {
        if (!redisClient)
            return payload;
        await redisClient.xAdd("bg_events", "*", {
            ts: Date.now().toString(),
            tenant: req.headers["x-tenant-id"] || "public",
            route: req.routeOptions.url ?? req.url,
            usd: "0",
            promptTok: "0",
            compTok: "0",
        });
        return payload;
    });
    await app.register(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rateLimit, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: redisClient,
        max: Number(process.env.MAX_REQS_PER_MIN || 100),
        timeWindow: "1 minute",
        keyGenerator: (req) => req.headers["x-tenant-id"] || "public",
        errorResponseBuilder: () => ({ error: "Rate limit exceeded" }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    });
    app.setErrorHandler((err, _req, reply) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (err.error === "Rate limit exceeded") {
            reply.code(429).send({ error: "Rate limit exceeded" });
            return;
        }
        reply.send(err);
    });
    app.get("/health", async () => ({ ok: true }));
    return app;
}
