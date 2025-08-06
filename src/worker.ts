import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import { incrementTagUsage } from "./tag-cache.js";
import dotenv from "dotenv";
dotenv.config();

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
      const usageLedgerEntry = await prisma.usageLedger.create({
        data: {
          ts: new Date(Number(data.ts)),
          tenant: data.tenant,
          tenantId: tenantRecord.id,
          route: data.route,
          model: data.model || "unknown",
          usd: data.usd,
          promptTok: Number(data.promptTok),
          compTok: Number(data.compTok),
        },
      });

      // Handle tag associations if present
      if (data.tags) {
        try {
          const tags = JSON.parse(data.tags) as Array<{
            id: number;
            name: string;
            weight: number;
          }>;

          // Create RequestTag entries for each tag and update usage cache
          for (const tag of tags) {
            await prisma.requestTag.create({
              data: {
                usageLedgerId: usageLedgerEntry.id,
                tagId: tag.id,
                weight: tag.weight,
                assignedBy: "header",
              },
            });

            // Increment tag usage cache for both daily and monthly periods
            const weightedUsage = parseFloat(data.usd) * tag.weight;
            const tenantName = data.tenant;

            // Increment daily usage (shorter TTL for more frequent updates)
            await incrementTagUsage(
              tenantName,
              tag.id,
              "daily",
              weightedUsage,
              redis,
              15 * 60,
            ); // 15 min TTL

            // Increment monthly usage (longer TTL)
            await incrementTagUsage(
              tenantName,
              tag.id,
              "monthly",
              weightedUsage,
              redis,
              30 * 60,
            ); // 30 min TTL
          }
        } catch (error) {
          console.error("Error processing tags for usage entry:", error);
          // Continue processing even if tag association fails
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
