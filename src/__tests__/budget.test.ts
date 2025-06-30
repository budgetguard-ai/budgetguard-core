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
      url: "/v1/completions",
      payload: { model: "gpt-3.5-turbo", prompt: "hi", max_tokens: 1 },
    });
    expect(res.statusCode).toBe(200);
  });

  it("blocks when over budget", async () => {
    const key = ledgerKey("daily");
    await redis.set(`ledger:public:${key}`, "0.00001");
    const res = await app.inject({
      method: "POST",
      url: "/v1/completions",
      payload: { model: "gpt-3.5-turbo", prompt: "hi", max_tokens: 1 },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json()).toEqual({ error: "Budget exceeded" });
  });
});
