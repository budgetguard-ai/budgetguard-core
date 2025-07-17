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
    tenant = { findFirst: async () => null };
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
  it("returns ok true", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("serves docs", async () => {
    const res = await app.inject({ method: "GET", url: "/docs" });
    expect(res.statusCode).toBe(200);
  });
});
