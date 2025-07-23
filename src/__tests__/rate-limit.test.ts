import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";

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
    async del(key: string) {
      delete this.data[key];
    }
  }
  const instance = new FakeRedis();
  return { createClient: () => instance };
});

vi.mock("@prisma/client", () => {
  interface Tenant {
    id: number;
    name: string;
    rateLimitPerMin: number | null;
  }
  class Collection<T extends { id: number }> {
    rows: T[] = [];
    async create({ data }: { data: Omit<T, "id"> }): Promise<T> {
      const row = { id: this.rows.length + 1, ...data } as T;
      this.rows.push(row);
      return row;
    }
    async findUnique({ where }: { where: { id: number } }): Promise<T | null> {
      return this.rows.find((r) => r.id === where.id) ?? null;
    }
    async findFirst({ where }: { where: Partial<T> }): Promise<T | null> {
      return (
        this.rows.find((r) =>
          Object.entries(where).every(
            ([k, v]) => (r as Record<string, unknown>)[k] === v,
          ),
        ) ?? null
      );
    }
    async update({
      where,
      data,
    }: {
      where: { id: number };
      data: Partial<T>;
    }): Promise<T> {
      const idx = this.rows.findIndex((r) => r.id === where.id);
      const cur = this.rows[idx];
      const updated = { ...cur } as T;
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined)
          (updated as unknown as Record<string, unknown>)[k] = v;
      }
      this.rows[idx] = updated;
      return updated;
    }
  }
  class FakePrisma {
    tenant = new Collection<Tenant>();
    async $connect() {}
    async $disconnect() {}
  }
  return { PrismaClient: FakePrisma };
});

let app: FastifyInstance;

beforeAll(async () => {
  process.env.ADMIN_API_KEY = "adminkey";
  delete process.env.REDIS_URL;
  process.env.MAX_REQS_PER_MIN = "5";
  app = await buildServer();
});

afterAll(async () => {
  await app.close();
});

describe("rate limiting", () => {
  it("limits requests per tenant", async () => {
    const headers = { "X-Tenant-Id": "test-tenant" };
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "GET", url: "/health", headers });
      expect(res.statusCode).toBe(200);
    }
    const last = await app.inject({ method: "GET", url: "/health", headers });
    expect(last.statusCode).toBe(429);
    expect(last.json()).toEqual({ error: "Rate limit exceeded" });
  }, 20000); // 20 second timeout for this test

  it("supports custom limits", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/admin/tenant",
      headers: { "x-admin-key": "adminkey" },
      payload: { name: "t1" },
    });
    const id = create.json().id as number;
    await app.inject({
      method: "PUT",
      url: `/admin/tenant/${id}/ratelimit`,
      headers: { "x-admin-key": "adminkey" },
      payload: { rateLimitPerMin: 2 },
    });
    const headers = { "X-Tenant-Id": "t1" };
    for (let i = 0; i < 2; i++) {
      const res = await app.inject({ method: "GET", url: "/health", headers });
      expect(res.statusCode).toBe(200);
    }
    const last = await app.inject({ method: "GET", url: "/health", headers });
    expect(last.statusCode).toBe(429);
  });
});
