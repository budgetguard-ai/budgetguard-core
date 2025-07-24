import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
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
    async setEx(key: string, _ttl: number, val: string) {
      this.data[key] = val;
    }
    async del(...keys: string[]) {
      keys.forEach(key => delete this.data[key]);
    }
    async keys(pattern: string) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Object.keys(this.data).filter(key => regex.test(key));
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
  interface ApiKey {
    id: number;
    key: string;
    tenantId: number;
    isActive: boolean;
    createdAt?: Date;
    lastUsedAt?: Date;
  }
  interface Budget {
    id: number;
    tenantId: number;
    period: string;
    amountUsd: string;
    startDate?: Date;
    endDate?: Date;
  }
  interface ModelPricing {
    id: number;
    model: string;
    versionTag: string;
    inputPrice: string;
    cachedInputPrice: string;
    outputPrice: string;
    provider: string;
  }
  class Collection<T extends { id: number }> {
    rows: T[] = [];
    async create({ data }: { data: Omit<T, "id"> }): Promise<T> {
      const row = { id: this.rows.length + 1, ...data } as T;
      this.rows.push(row);
      return row;
    }
    async findUnique({
      where,
    }: {
      where: { id?: number; model?: string };
    }): Promise<T | null> {
      if (where.id !== undefined) {
        return this.rows.find((r) => r.id === where.id) ?? null;
      }
      if (where.model !== undefined) {
        return (
          this.rows.find(
            (r) => (r as T & { model?: string }).model === where.model,
          ) ?? null
        );
      }
      return null;
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
    async deleteMany({ where }: { where: Partial<T> }): Promise<{ count: number }> {
      const toDelete = this.rows.filter((r) =>
        Object.entries(where).every(
          ([k, v]) => (r as Record<string, unknown>)[k] === v,
        ),
      );
      this.rows = this.rows.filter((r) =>
        !Object.entries(where).every(
          ([k, v]) => (r as Record<string, unknown>)[k] === v,
        ),
      );
      return { count: toDelete.length };
    }
  }
  class FakePrisma {
    tenant = new Collection<Tenant>();
    apiKey = new Collection<ApiKey>();
    budget = new Collection<Budget>();
    modelPricing = new Collection<ModelPricing>();
    auditLog = new Collection<{
      id: number;
      tenantId: number;
      actor: string;
      event: string;
      details: string;
    }>();
    usageLedger = new Collection<{
      id: number;
      tenantId: number;
      usd: string;
      promptTokens: number;
      completionTokens: number;
      timestamp: Date;
    }>();

    constructor() {
      // Pre-seed with gpt-4o-mini model for tests
      this.modelPricing.rows.push({
        id: 1,
        model: "gpt-4o-mini",
        versionTag: "gpt-4o-mini-2024-07-18",
        inputPrice: "0.15",
        cachedInputPrice: "0.075",
        outputPrice: "0.60",
        provider: "openai",
      });
    }

    async $connect() {}
    async $disconnect() {}
    async $transaction<T>(fn: (tx: FakePrisma) => Promise<T>): Promise<T> {
      // For tests, just execute the transaction function with this instance
      return fn(this);
    }
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
  process.env.OPENAI_KEY = "test-key";
  vi.stubGlobal("fetch", async () => ({
    status: 200,
    json: async () => ({ choices: [{ text: "ok" }], model: "gpt-3.5-turbo" }),
  }));
  redis = createClient();
  const mod = await import("../server");
  buildServer = mod.buildServer;
  app = await buildServer();
});

beforeEach(() => {
  const r = redis as unknown as {
    data: Record<string, string>;
    stream: Array<Record<string, string>>;
  };
  r.data = {};
  r.stream = [];
});

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
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

  it("updates tenant information", async () => {
    // Create a tenant first
    const createRes = await app.inject({
      method: "POST",
      url: "/admin/tenant",
      headers: { "x-admin-key": "adminkey" },
      payload: { name: "updateTest" },
    });
    expect(createRes.statusCode).toBe(200);
    const tenant = createRes.json();

    // Update tenant name
    const updateRes = await app.inject({
      method: "PUT",
      url: `/admin/tenant/${tenant.id}`,
      headers: { "x-admin-key": "adminkey" },
      payload: { name: "updatedName" },
    });
    expect(updateRes.statusCode).toBe(200);
    const updated = updateRes.json();
    expect(updated.name).toBe("updatedName");
    expect(updated.id).toBe(tenant.id);

    // Update rate limit
    const rateLimitRes = await app.inject({
      method: "PUT",
      url: `/admin/tenant/${tenant.id}`,
      headers: { "x-admin-key": "adminkey" },
      payload: { rateLimitPerMin: 50 },
    });
    expect(rateLimitRes.statusCode).toBe(200);
    expect(rateLimitRes.json().rateLimitPerMin).toBe(50);

    // Verify both fields can be updated together
    const bothRes = await app.inject({
      method: "PUT",
      url: `/admin/tenant/${tenant.id}`,
      headers: { "x-admin-key": "adminkey" },
      payload: { name: "finalName", rateLimitPerMin: 25 },
    });
    expect(bothRes.statusCode).toBe(200);
    const final = bothRes.json();
    expect(final.name).toBe("finalName");
    expect(final.rateLimitPerMin).toBe(25);
  });

  it("handles update tenant validation errors", async () => {
    // Create a tenant first
    const createRes = await app.inject({
      method: "POST",
      url: "/admin/tenant",
      headers: { "x-admin-key": "adminkey" },
      payload: { name: "validationTest" },
    });
    const tenant = createRes.json();

    // Test empty name
    const emptyNameRes = await app.inject({
      method: "PUT",
      url: `/admin/tenant/${tenant.id}`,
      headers: { "x-admin-key": "adminkey" },
      payload: { name: "" },
    });
    expect(emptyNameRes.statusCode).toBe(400);
    expect(emptyNameRes.json().error).toBe("Name cannot be empty");

    // Test non-existent tenant
    const notFoundRes = await app.inject({
      method: "PUT",
      url: "/admin/tenant/999",
      headers: { "x-admin-key": "adminkey" },
      payload: { name: "test" },
    });
    expect(notFoundRes.statusCode).toBe(404);
    expect(notFoundRes.json().error).toBe("Tenant not found");
  });

  it("deletes tenants and cascades related data", async () => {
    // Create a tenant first
    const createRes = await app.inject({
      method: "POST",
      url: "/admin/tenant",
      headers: { "x-admin-key": "adminkey" },
      payload: { name: "deleteTest" },
    });
    const tenant = createRes.json();

    // Add some related data
    await app.inject({
      method: "POST",
      url: `/admin/tenant/${tenant.id}/budgets`,
      headers: { "x-admin-key": "adminkey" },
      payload: { budgets: [{ period: "daily", amountUsd: 10 }] },
    });

    await app.inject({
      method: "POST",
      url: `/admin/tenant/${tenant.id}/apikeys`,
      headers: { "x-admin-key": "adminkey" },
      payload: {},
    });

    // Set some Redis cache data (use correct period from env)
    await redis.set(`budget:deleteTest:daily`, JSON.stringify({ amount: 10 }));
    await redis.set(`ratelimit:deleteTest`, "100");
    await redis.set(`ledger:deleteTest:daily-2024`, "5.50");

    // Verify data exists before deletion
    expect(await redis.get(`budget:deleteTest:daily`)).toBeTruthy();
    expect(await redis.get(`ratelimit:deleteTest`)).toBeTruthy();
    expect(await redis.get(`ledger:deleteTest:daily-2024`)).toBeTruthy();

    // Delete the tenant
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/admin/tenant/${tenant.id}`,
      headers: { "x-admin-key": "adminkey" },
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().ok).toBe(true);

    // Verify tenant is deleted
    const getRes = await app.inject({
      method: "GET",
      url: `/admin/tenant/${tenant.id}`,
      headers: { "x-admin-key": "adminkey" },
    });
    expect(getRes.statusCode).toBe(404);

    // Verify Redis cache is cleaned up
    expect(await redis.get(`budget:deleteTest:daily`)).toBeNull();
    expect(await redis.get(`ratelimit:deleteTest`)).toBeNull();
    expect(await redis.get(`ledger:deleteTest:daily-2024`)).toBeNull();

    // Verify related data is deleted (should return empty arrays now)
    const budgetsRes = await app.inject({
      method: "GET",
      url: `/admin/tenant/${tenant.id}/budgets`,
      headers: { "x-admin-key": "adminkey" },
    });
    expect(budgetsRes.statusCode).toBe(200);
    expect(budgetsRes.json()).toEqual([]); // Empty array since tenant data was deleted

    const apiKeysRes = await app.inject({
      method: "GET",
      url: `/admin/tenant/${tenant.id}/apikeys`,
      headers: { "x-admin-key": "adminkey" },
    });
    expect(apiKeysRes.statusCode).toBe(200);
    expect(apiKeysRes.json()).toEqual([]); // Empty array since tenant data was deleted
  });

  it("handles delete tenant errors", async () => {
    // Test non-existent tenant
    const notFoundRes = await app.inject({
      method: "DELETE",
      url: "/admin/tenant/999",
      headers: { "x-admin-key": "adminkey" },
    });
    expect(notFoundRes.statusCode).toBe(404);
    expect(notFoundRes.json().error).toBe("Tenant not found");
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

  it("manages api keys", async () => {
    let res = await app.inject({
      method: "POST",
      url: "/admin/tenant/1/apikeys",
      headers: { "x-admin-key": "adminkey" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const created = res.json();
    expect(created.key.length).toBe(64);

    res = await app.inject({
      method: "GET",
      url: "/admin/tenant/1/apikeys",
      headers: { "x-admin-key": "adminkey" },
    });
    expect(res.json().length).toBe(1);

    const apiKeys = await app.inject({
      method: "GET",
      url: "/admin/tenant/1/apikeys",
      headers: { "x-admin-key": "adminkey" },
    });
    console.log("API keys for tenant 1:", apiKeys.json());

    res = await app.inject({
      method: "DELETE",
      url: `/admin/apikey/${created.id}`,
      headers: { "x-admin-key": "adminkey" },
    });
    expect(res.json()).toEqual({ ok: true });
    res = await app.inject({
      method: "GET",
      url: "/admin/tenant/1/apikeys",
      headers: { "x-admin-key": "adminkey" },
    });
    expect(res.json()[0].isActive).toBe(false);
  });

  it("authenticates requests with api keys", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/admin/tenant/1/apikeys",
      headers: { "x-admin-key": "adminkey" },
      payload: {},
    });
    const { key, id } = create.json();

    // Set a budget for the tenant so completions are allowed
    await app.inject({
      method: "POST",
      url: "/admin/tenant/1/budgets",
      headers: { "x-admin-key": "adminkey" },
      payload: { budgets: [{ period: "daily", amountUsd: 10 }] },
    });

    console.log("Redis data before completion:", redis.data);
    console.log("All Redis keys:", Object.keys(redis.data));

    let res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      headers: { "x-api-key": key },
      payload: { model: "gpt-4o-mini", input: "hi" },
    });
    console.log("Completion response status:", res.statusCode);
    console.log("Completion response body:", res.body);

    expect(res.statusCode).toBe(200);

    await app.inject({
      method: "DELETE",
      url: `/admin/apikey/${id}`,
      headers: { "x-admin-key": "adminkey" },
    });

    res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      headers: { "x-api-key": key },
      payload: { model: "gpt-4o-mini", input: "hi" },
    });

    expect(res.statusCode).toBe(401);
  });
});
