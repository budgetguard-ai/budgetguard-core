import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import dotenv from "dotenv";
// @ts-expect-error: Importing .ts extension directly for compatibility
import { ledgerKey, getBudgetPeriods } from "./ledger.ts";

dotenv.config();

const BUDGET_PERIODS = getBudgetPeriods();

async function main() {
  const prisma = new PrismaClient();
  await prisma.tenant.upsert({
    where: { name: "public" },
    update: {},
    create: { name: "public" },
  });
  const redis = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
  });
  await redis.connect();

  const stream = "bg_events";
  let lastId = "$";

  while (true) {
    const res = (await redis.xRead(
      { key: stream, id: lastId },
      { BLOCK: 0, COUNT: 1 },
    )) as Array<{
      messages: Array<{ id: string; message: Record<string, string> }>;
    }> | null;
    if (!res) continue;
    const [{ messages }] = res;
    for (const msg of messages) {
      lastId = msg.id;
      const data = msg.message;
      const tenantRecord = await prisma.tenant.upsert({
        where: { name: data.tenant },
        update: {},
        create: { name: data.tenant },
      });
      await prisma.usageLedger.create({
        data: {
          ts: new Date(Number(data.ts)),
          tenant: data.tenant,
          tenantId: tenantRecord.id,
          route: data.route,
          usd: data.usd,
          promptTok: Number(data.promptTok),
          compTok: Number(data.compTok),
        },
      });
      for (const period of BUDGET_PERIODS) {
        const key = ledgerKey(period, new Date(Number(data.ts)));
        await redis.incrByFloat(
          `ledger:${data.tenant}:${key}`,
          parseFloat(data.usd),
        );
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
