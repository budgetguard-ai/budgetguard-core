import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import {
  execSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "child_process";

let prisma: PrismaClient;
let redis: ReturnType<typeof createClient>;
let worker: ChildProcessWithoutNullStreams;

beforeEach(async () => {
  await prisma.usageLedger.deleteMany();
});

beforeAll(async () => {
  process.env.DATABASE_URL =
    "postgres://postgres:secret@localhost:5432/budgetguard";
  // execSync("npx prisma migrate deploy");
  prisma = new PrismaClient();
  await prisma.$connect();
  redis = createClient();
  await redis.connect();
  worker = spawn("npx", ["ts-node", "src/worker.ts"], { env: process.env });
  await new Promise((r) => setTimeout(r, 1000));
});

afterAll(
  async () => {
    if (worker) worker.kill();
    await redis.quit();
    await prisma.$disconnect();
    execSync("docker compose down");
  },
  30000, // Set timeout to 30 seconds
);

describe("usage ledger", () => {
  it("inserts events", async () => {
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
    await new Promise((r) => setTimeout(r, 2000));
    const rows = await prisma.usageLedger.findMany();
    expect(rows.length).toBe(3);
  });
});
