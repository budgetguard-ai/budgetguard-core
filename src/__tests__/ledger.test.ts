import { describe, it, expect, beforeEach, vi } from "vitest";
import { createClient } from "redis";
import { PrismaClient } from "@prisma/client";

vi.mock("redis", () => {
  type Message = Record<string, string>;
  class FakeRedis {
    stream: Message[] = [];
    async connect() {}
    async quit() {}
    async del() {
      this.stream = [];
    }
    async xAdd(_s: string, _id: string, message: Message) {
      this.stream.push(message);
    }
    async xRead(): Promise<Array<{
      messages: Array<{ id: string; message: Message }>;
    }> | null> {
      if (this.stream.length === 0) return null;
      const msg = this.stream.shift()!;
      return [{ messages: [{ id: "1", message: msg }] }];
    }
  }
  return { createClient: () => new FakeRedis() };
});

vi.mock("@prisma/client", () => {
  interface LedgerEntry {
    id: bigint;
    ts: Date;
    tenant: string;
    route: string;
    usd: string;
    promptTok: number;
    compTok: number;
  }
  class FakePrisma {
    usageLedger = {
      rows: [] as LedgerEntry[],
      async create({ data }: { data: Omit<LedgerEntry, "id"> }) {
        this.rows.push({ id: BigInt(this.rows.length + 1), ...data });
      },
      async findFirst({
        where,
      }: {
        where: { route: string };
      }): Promise<LedgerEntry | null> {
        return this.rows.find((r) => r.route === where.route) ?? null;
      },
      async deleteMany(): Promise<void> {
        this.rows = [];
      },
    };
    async $connect() {}
    async $disconnect() {}
  }
  return { PrismaClient: FakePrisma };
});

let prisma: PrismaClient;
let redis: ReturnType<typeof createClient>;

beforeEach(() => {
  prisma = new PrismaClient();
  redis = createClient();
});

beforeEach(async () => {
  await prisma.usageLedger.deleteMany();
  await redis.del("bg_events");
});

describe("usage ledger", () => {
  it("processes queued events", async () => {
    for (let i = 0; i < 3; i++) {
      await redis.xAdd("bg_events", "*", {
        ts: Date.now().toString(),
        tenant: "t",
        route: "/test",
        usd: "0.1",
        promptTok: "5",
        compTok: "2",
      });
    }

    const r = redis as unknown as {
      xRead: () => Promise<Array<{
        messages: Array<{ id: string; message: Record<string, string> }>;
      }> | null>;
    };
    let res: Array<{
      messages: Array<{ id: string; message: Record<string, string> }>;
    }> | null;
    while ((res = await r.xRead())) {
      const [{ messages }] = res;
      for (const msg of messages) {
        const data = msg.message;
        await prisma.usageLedger.create({
          data: {
            ts: new Date(Number(data.ts)),
            tenant: data.tenant,
            route: data.route,
            usd: data.usd,
            promptTok: Number(data.promptTok),
            compTok: Number(data.compTok),
          },
        });
      }
    }

    const row = await prisma.usageLedger.findFirst({
      where: { route: "/test" },
    });
    expect(row).toBeTruthy();
    expect(row?.tenant).toBe("t");
    expect(row?.promptTok).toBe(5);
    expect(row?.compTok).toBe(2);
  });
});
