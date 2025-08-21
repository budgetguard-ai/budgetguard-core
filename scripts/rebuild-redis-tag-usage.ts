#!/usr/bin/env npx tsx

import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import { createTagUsageTracker } from "../src/tag-usage-tracking.js";

/**
 * Rebuild Redis tag usage cache from clean database data
 * This script recreates the Redis tag usage data from the authoritative database
 * to eliminate any corruption or double-counting issues
 */
async function rebuildRedisTagUsage() {
  const prisma = new PrismaClient();
  const redis = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
  });

  try {
    await prisma.$connect();
    await redis.connect();
    console.log("Connected to database and Redis");

    // Clear existing Redis tag usage data first
    const patterns = [
      "tag_usage_stream:*",
      "tag_usage_zset:*", 
      "tag_usage_agg:*",
      "tag_usage_rt:*",
      "tag_usage_event:*"
    ];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(keys);
        console.log(`Cleared ${keys.length} keys for pattern ${pattern}`);
      }
    }

    // Get all RequestTag entries with their usage data
    const requestTags = await prisma.requestTag.findMany({
      include: {
        usage: true,
        tag: true
      },
      orderBy: {
        usage: {
          ts: 'asc'
        }
      }
    });

    console.log(`Found ${requestTags.length} tag usage entries to rebuild`);

    const tracker = createTagUsageTracker(redis, prisma);
    let processed = 0;

    // Rebuild Redis data from database records
    for (const requestTag of requestTags) {
      try {
        await tracker.recordTagUsage({
          tenantId: requestTag.usage.tenantId,
          tenant: requestTag.usage.tenant,
          tagId: requestTag.tagId,
          tagName: requestTag.tag.name,
          usdAmount: parseFloat(requestTag.usage.usd.toString()),
          weight: requestTag.weight,
          timestamp: requestTag.usage.ts,
          usageLedgerId: requestTag.usageLedgerId,
          sessionId: undefined, // Not available in historical data
          model: requestTag.usage.model,
          route: requestTag.usage.route
        });

        processed++;
        if (processed % 100 === 0) {
          console.log(`Processed ${processed}/${requestTags.length} entries`);
        }
      } catch (error) {
        console.warn(`Failed to rebuild entry for requestTag ${requestTag.id}:`, error);
      }
    }

    console.log(`✅ Successfully rebuilt Redis cache from ${processed} database entries`);

    // Verify a sample of the rebuilt data
    console.log("\n📊 Verification sample:");
    
    const sampleTenants = await prisma.tenant.findMany({ take: 3 });
    for (const tenant of sampleTenants) {
      const tags = await prisma.tag.findMany({ 
        where: { tenantId: tenant.id }, 
        take: 2 
      });
      
      for (const tag of tags) {
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
        const endDate = new Date();
        
        // Get database usage
        const dbUsage = await tracker.queryTagUsage({
          tenantId: tenant.id,
          tenant: tenant.name,
          tagIds: [tag.id],
          startDate,
          endDate,
          period: "custom"
        });
        
        // Get real-time usage (should be 0 since we're looking at historical data)
        const rtUsage = await tracker.getRealTimeUsage(tenant.id, tag.id);
        
        console.log(`  ${tenant.name}/${tag.name}: DB=${dbUsage[0]?.totalUsage || 0}, RT=${rtUsage}`);
      }
    }

  } catch (error) {
    console.error("❌ Error rebuilding Redis tag usage cache:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await redis.disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  rebuildRedisTagUsage();
}

export { rebuildRedisTagUsage };