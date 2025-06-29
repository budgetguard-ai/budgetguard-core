import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
});

afterAll(async () => {
  await app.close();
});

describe("rate limiting", () => {
  it("limits requests per tenant", async () => {
    const headers = { "X-Tenant-Id": "test-tenant" };
    for (let i = 0; i < 100; i++) {
      const res = await app.inject({ method: "GET", url: "/health", headers });
      expect(res.statusCode).toBe(200);
    }
    const last = await app.inject({ method: "GET", url: "/health", headers });
    expect(last.statusCode).toBe(429);
    expect(last.json()).toEqual({ error: "Rate limit exceeded" });
  });
});
