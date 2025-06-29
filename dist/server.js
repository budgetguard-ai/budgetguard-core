import fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { createClient } from "redis";
export async function buildServer() {
    const app = fastify({ logger: true });
    let redisClient;
    if (process.env.REDIS_URL) {
        redisClient = createClient({ url: process.env.REDIS_URL });
        await redisClient.connect();
    }
    await app.register(rateLimit, {
        ...(redisClient ? { client: redisClient } : {}),
        max: 100,
        timeWindow: "1 minute",
        keyGenerator: (req) => req.headers["x-tenant-id"] || "public",
    });
    app.get("/health", async () => ({ ok: true }));
    return app;
}
if (process.env.NODE_ENV !== "test") {
    const app = await buildServer();
    app.listen({ port: 3000, host: "0.0.0.0" }).catch((err) => {
        app.log.error(err);
        process.exit(1);
    });
}
