import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
// Removed unused import: incrementTagUsage from "./tag-cache.js"
import { createTagUsageTracker } from "./tag-usage-tracking.js";
import dotenv from "dotenv";
dotenv.config();

// Legacy TTL constants removed - no longer using legacy cache fallback

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
          sessionId: data.sessionId || null,
          status: data.status || "success", // Default to success for backward compatibility
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
          const usdValue = parseFloat(data.usd); // Parse once outside the loop
          const tracker = createTagUsageTracker(redis, prisma);

          for (const tag of tags) {
            await prisma.requestTag.create({
              data: {
                usageLedgerId: usageLedgerEntry.id,
                tagId: tag.id,
                weight: tag.weight,
                assignedBy: "header",
              },
            });

            // Use new Redis-based tag usage tracking
            try {
              await tracker.recordTagUsage({
                tenantId: tenantRecord.id,
                tenant: data.tenant,
                tagId: tag.id,
                tagName: tag.name,
                usdAmount: usdValue,
                weight: tag.weight,
                timestamp: new Date(Number(data.ts)),
                usageLedgerId: Number(usageLedgerEntry.id),
                sessionId: data.sessionId, // if available in event data
                model: data.model || "unknown",
                route: data.route,
              });
            } catch (error) {
              console.warn(
                `Failed to record Redis tag usage for tag ${tag.id}:`,
                error,
              );
              // Continue with legacy cache update as fallback
            }

            /* Keep legacy cache increment as fallback (shorter TTL for gradual migration)
            const weightedUsage = usdValue * tag.weight;
            const tenantName = data.tenant;

            await incrementTagUsage(
              tenantName,
              tag.id,
              "daily",
              weightedUsage,
              redis,
              LEGACY_DAILY_TAG_USAGE_TTL_SECONDS,
            );

            await incrementTagUsage(
              tenantName,
              tag.id,
              "monthly",
              weightedUsage,
              redis,
              LEGACY_MONTHLY_TAG_USAGE_TTL_SECONDS,
            ); */
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
