import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
let buildServer: typeof import("../server").buildServer;
import { createClient } from "redis";
import { ledgerKey } from "../ledger.js";

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
    async mGet(keys: string[]) {
      return keys.map(key => this.data[key] ?? null);
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
    async findFirst({ where }: { where: Partial<T> }): Promise<T | null> {
      return (
        this.rows.find((r) =>
          Object.entries(where).every(
            ([k, v]) => (r as Record<string, unknown>)[k] === v,
          ),
        ) ?? null
      );
    }
    async findMany({ where }: { where?: Partial<T> } = {}): Promise<T[]> {
      if (!where) return [...this.rows];
      return this.rows.filter((r) =>
        Object.entries(where).every(
          ([k, v]) => (r as Record<string, unknown>)[k] === v,
        ),
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
    async delete({ where }: { where: { id: number } }): Promise<T> {
      const idx = this.rows.findIndex((r) => r.id === where.id);
      const [removed] = this.rows.splice(idx, 1);
      return removed as T;
    }
  }
  class FakePrisma {
    tenant = new Collection<Tenant>();
    budget = new Collection<Budget>();
    modelPricing = new Collection<ModelPricing>();

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

vi.mock("@open-policy-agent/opa-wasm", () => ({
  default: {
    loadPolicy: async () => ({
      evaluate: (input: Record<string, unknown>) => [
        {
          result:
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Array.isArray((input as any).budgets) &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (input as any).budgets.every(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (b: any) => b.usage < b.budget,
            ) &&
            !(
              input.route === "/admin/tenant-usage" &&
              (input.time as number) > 20
            ),
        },
      ],
    }),
  },
}));

vi.stubGlobal("fetch", async () => ({
  status: 200,
  json: async () => ({ choices: [{ text: "ok" }], model: "gpt-3.5-turbo" }),
}));

let app: FastifyInstance;
let redis: ReturnType<typeof createClient>;

beforeAll(async () => {
  process.env.DEFAULT_BUDGET_USD = "0.00001";
  process.env.BUDGET_PERIODS = "daily";
  process.env.BUDGET_DAILY_USD = "0.00001";
  process.env.REDIS_URL = "redis://test";
  process.env.OPENAI_KEY = "test-key";
  process.env.ADMIN_API_KEY = "adminkey";
  redis = createClient();
  const mod = await import("../server");
  buildServer = mod.buildServer;
  app = await buildServer();
});

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe("budget enforcement", () => {
  it("allows under budget", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "gpt-4o-mini", input: "hi", max_tokens: 1 },
    });
    expect(res.statusCode).toBe(200);
  });

  it("blocks when over budget", async () => {
    const key = ledgerKey("daily");
    await redis.set(`ledger:public:${key}`, "0.00001");
    const res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "gpt-4o-mini", input: "hi", max_tokens: 1 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "Request denied by policy" });
  });

  it("uses redis cached budget on hit", async () => {
    process.env.BUDGET_DAILY_USD = "0.000005";
    const key = ledgerKey("daily");
    await redis.set(`ledger:public:${key}`, "0.000009");
    await redis.set(
      "budget:public:daily",
      JSON.stringify({
        amount: 0.00002,
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
      }),
    );
    const res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "gpt-4o-mini", input: "hi", max_tokens: 1 },
    });
    expect(res.statusCode).toBe(200);
  });

  it("falls back to db and caches on miss", async () => {
    // create tenant and budget via admin API
    await app.inject({
      method: "POST",
      url: "/admin/tenant",
      headers: { "x-admin-key": "adminkey" },
      payload: { name: "t1" },
    });
    await app.inject({
      method: "POST",
      url: "/admin/tenant/1/budgets",
      headers: { "x-admin-key": "adminkey" },
      payload: { budgets: [{ period: "daily", amountUsd: 0.00003 }] },
    });
    await redis.del("budget:t1:daily");
    const res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      headers: { "x-tenant-id": "t1" },
      payload: { model: "gpt-4o-mini", input: "hi", max_tokens: 1 },
    });
    expect(res.statusCode).toBe(200);
    // For recurring budgets, the cached amount should match the configured budget
    const cached = JSON.parse((await redis.get("budget:t1:daily"))!);
    expect(cached.amount).toBe(0.00003); // Budget amount from DB
  });
});
