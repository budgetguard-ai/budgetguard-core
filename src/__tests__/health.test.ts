import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildServer } from "../server";
import type { FastifyInstance } from "fastify";

vi.mock("redis", () => {
  class FakeRedis {
    data: Record<string, string> = {};
    async connect() {}
    async quit() {}
    async get(key: string) {
      return this.data[key] ?? null;
    }
    async set(key: string, val: string) {
      this.data[key] = val;
    }
    async setEx(key: string, _ttl: number, val: string) {
      this.data[key] = val;
    }
  }
  return { createClient: () => new FakeRedis() };
});

vi.mock("@prisma/client", () => {
  class FakePrisma {
    async $connect() {}
    async $disconnect() {}
    async $queryRaw() {
      return [{ "1": 1 }];
    }
    tenant = { findFirst: async () => null };
    modelPricing = { findUnique: async () => null };
  }
  return { PrismaClient: FakePrisma };
});

let app: FastifyInstance;

beforeAll(async () => {
  delete process.env.REDIS_URL;
  app = await buildServer();
});

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("returns health status with dependencies", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      ok: expect.any(Boolean),
      dependencies: {
        database: expect.any(Boolean),
        redis: expect.any(Boolean),
        providers: {
          configured: expect.any(Number),
          healthy: expect.any(Number),
        },
      },
    });
  });

  it("serves docs", async () => {
    const res = await app.inject({ method: "GET", url: "/docs" });
    expect(res.statusCode).toBe(200);
  });
});
