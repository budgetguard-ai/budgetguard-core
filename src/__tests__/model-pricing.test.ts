import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";

vi.mock("redis", () => {
  class FakeRedis {
    async connect() {}
    async quit() {}
  }
  return { createClient: () => new FakeRedis() };
});

vi.mock("@prisma/client", () => {
  interface ModelPricing {
    id: number;
    model: string;
    versionTag: string;
    inputPrice: string;
    cachedInputPrice: string;
    outputPrice: string;
  }
  class Collection<T extends { id: number }> {
    rows: T[] = [];
    async create({ data }: { data: Omit<T, "id"> }): Promise<T> {
      const row = { id: this.rows.length + 1, ...data } as T;
      this.rows.push(row);
      return row;
    }
    async findMany(): Promise<T[]> {
      return [...this.rows];
    }
    async update({
      where,
      data,
    }: {
      where: Partial<T>;
      data: Partial<T>;
    }): Promise<T> {
      const idx = this.rows.findIndex((r) =>
        Object.entries(where).every(
          ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
        ),
      );
      if (idx === -1) throw new Error("not found");
      const current = this.rows[idx];
      const updated = { ...current, ...data } as T;
      this.rows[idx] = updated;
      return updated;
    }
  }
  class FakePrisma {
    modelPricing = new Collection<ModelPricing>();
    tenant = { findFirst: async () => null };
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

beforeAll(async () => {
  process.env.ADMIN_API_KEY = "adminkey";
  delete process.env.REDIS_URL;
  app = await buildServer();
});

afterAll(async () => {
  await app.close();
});

describe("model pricing admin endpoints", () => {
  it("creates and updates pricing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/model-pricing",
      headers: { "x-admin-key": "adminkey" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);

    const create = await app.inject({
      method: "POST",
      url: "/admin/model-pricing",
      headers: { "x-admin-key": "adminkey" },
      payload: {
        model: "m1",
        versionTag: "m1-v1",
        inputPrice: 1,
        cachedInputPrice: 0.5,
        outputPrice: 2,
      },
    });
    expect(create.statusCode).toBe(200);
    const created = create.json();
    expect(created.model).toBe("m1");

    const update = await app.inject({
      method: "PUT",
      url: "/admin/model-pricing/m1",
      headers: { "x-admin-key": "adminkey" },
      payload: { outputPrice: 3 },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().outputPrice).toBe(3);
  });
});
