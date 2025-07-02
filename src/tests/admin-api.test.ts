import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
// integration tests for admin API
import type { FastifyInstance } from "fastify";
import { ledgerKey } from "../ledger.js";
import { createClient } from "redis";

vi.mock("redis", () => {
  class FakeRedis {
    data: Record<string, string> = {};
    stream: Record<string, string>[] = [];
    async connect() {}
    async quit() {}
    async get(key: string) {
      return this.data[key] ?? null;
    }
    async set(key: string, val: string) {
      this.data[key] = val;
    }
    async del(key: string) {
      delete this.data[key];
    }
    async incrByFloat(key: string, val: number) {
      const cur = parseFloat(this.data[key] ?? "0");
      this.data[key] = String(cur + val);
    }
    async xAdd(_s: string, _id: string, message: Record<string, string>) {
      this.stream.push(message);
    }
    async xRead() {
      return null;
    }
  }
  const instance = new FakeRedis();
  return { createClient: () => instance };
});

vi.mock("@prisma/client", () => {
  interface Tenant {
    id: number;
    name: string;
  }
  interface Budget {
    id: number;
    tenantId: number;
    period: string;
    amountUsd: string;
    startDate?: Date;
    endDate?: Date;
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
    async findMany({ where }: { where?: Partial<T> } = {}): Promise<T[]> {
      if (!where) return [...this.rows];
      return this.rows.filter((r) =>
        Object.entries(where).every(
          ([k, v]) => (r as Record<string, unknown>)[k] === v,
        ),
      );
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
        if (v !== undefined) (updated as Record<string, unknown>)[k] = v;
      }
      this.rows[idx] = updated;
      return updated;
    }
    async delete({ where }: { where: { id: number } }): Promise<T | null> {
      const idx = this.rows.findIndex((r) => r.id === where.id);
      if (idx === -1) return null;
      const [removed] = this.rows.splice(idx, 1);
      return removed as T;
    }
  }
  class FakePrisma {
    tenant = new Collection<Tenant>();
    budget = new Collection<Budget>();
    async $connect() {}
    async $disconnect() {}
  }
  class Decimal {
    private val: string;
    constructor(v: number | string) {
      this.val = String(v);
    }
    toString() {
      return this.val;
    }
    toJSON() {
      return this.val;
    }
  }
  const Prisma = { Decimal };
  return { PrismaClient: FakePrisma, Prisma };
});

let app: FastifyInstance;
let redis: ReturnType<typeof createClient>;
let buildServer: typeof import("../server").buildServer;

beforeAll(async () => {
  process.env.ADMIN_API_KEY = "adminkey";
  process.env.BUDGET_PERIODS = "daily";
  process.env.REDIS_URL = "redis://test";
  redis = createClient();
  const mod = await import("../server");
  buildServer = mod.buildServer;
  app = await buildServer();
});

afterAll(async () => {
  await app.close();
});

describe("admin endpoints", () => {
  it("creates and lists tenants", async () => {
    let res = await app.inject({
      method: "POST",
      url: "/admin/tenant",
      headers: { "x-admin-key": "adminkey" },
      payload: { name: "t1" },
    });
    expect(res.statusCode).toBe(200);
    const tenant = res.json();
    expect(tenant.name).toBe("t1");

    res = await app.inject({
      method: "GET",
      url: "/admin/tenant",
      headers: { "x-admin-key": "adminkey" },
    });
    const list = res.json();
    expect(list.length).toBe(1);
  });

  it("manages budgets", async () => {
    const res1 = await app.inject({
      method: "POST",
      url: "/admin/tenant/1/budgets",
      headers: { "x-admin-key": "adminkey" },
      payload: { budgets: [{ period: "monthly", amountUsd: 10 }] },
    });
    expect(res1.statusCode).toBe(200);
    const [budget] = res1.json();
    expect(budget.period).toBe("monthly");
    const cached = JSON.parse((await redis.get("budget:t1:monthly"))!);
    expect(cached.amount).toBe(10);

    const res2 = await app.inject({
      method: "GET",
      url: "/admin/tenant/1/budgets",
      headers: { "x-admin-key": "adminkey" },
    });
    expect(res2.json().length).toBe(1);

    const upd = await app.inject({
      method: "PUT",
      url: `/admin/budget/${budget.id}`,
      headers: { "x-admin-key": "adminkey" },
      payload: { amountUsd: 20 },
    });
    expect(upd.json().amountUsd).toBe(20);
    const cachedUpd = JSON.parse((await redis.get("budget:t1:monthly"))!);
    expect(cachedUpd.amount).toBe(20);

    await app.inject({
      method: "DELETE",
      url: `/admin/budget/${budget.id}`,
      headers: { "x-admin-key": "adminkey" },
    });
    expect(await redis.get("budget:t1:monthly")).toBeNull();
    const list = await app.inject({
      method: "GET",
      url: "/admin/tenant/1/budgets",
      headers: { "x-admin-key": "adminkey" },
    });
    expect(list.json().length).toBe(0);
  });

  it("reports usage", async () => {
    const key = ledgerKey("daily");
    await redis.set(`ledger:t1:${key}`, "5");
    const res = await app.inject({
      method: "GET",
      url: "/admin/tenant/1/usage",
      headers: { "x-admin-key": "adminkey" },
    });
    expect(res.json()).toEqual({ daily: 5 });
  });
});
