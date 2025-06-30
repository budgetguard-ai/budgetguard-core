import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const prisma = new PrismaClient();
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
