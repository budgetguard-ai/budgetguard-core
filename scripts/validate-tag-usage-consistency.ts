#!/usr/bin/env npx tsx

import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import { createTagUsageTracker } from "../src/tag-usage-tracking.js";

/**
 * Validate Redis vs Database consistency for tag usage data
 * This monitoring script checks for discrepancies that could indicate
 * double-counting or other data integrity issues
 */
async function validateTagUsageConsistency() {
  const prisma = new PrismaClient();
  const redis = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
  });

  try {
    await prisma.$connect();
    await redis.connect();
    console.log("Connected to database and Redis");

    const tracker = createTagUsageTracker(redis, prisma);

    // Get idempotency stats
    console.log("\n🔍 Idempotency Statistics:");
    const idemStats = await tracker.getIdempotencyStats();
    console.log(`  Total idempotency keys: ${idemStats.totalKeys}`);
    console.log(`  Worker keys: ${idemStats.workerKeys}`);
    console.log(`  Server keys: ${idemStats.serverKeys}`);
    if (idemStats.oldestKey && idemStats.newestKey) {
      console.log(`  Key age range: ${idemStats.oldestKey.toISOString()} to ${idemStats.newestKey.toISOString()}`);
    }

    // Test consistency for recent data (last 7 days)
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = new Date();
    
    console.log(`\n📊 Consistency Validation (${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}):`);

    // Get active tags for validation
    const activeTags = await prisma.tag.findMany({
      include: {
        _count: {
          select: { usage: true }
        }
      },
      where: {
        usage: {
          some: {
            usage: {
              ts: {
                gte: startDate,
                lte: endDate
              }
            }
          }
        }
      },
      take: 10, // Limit to 10 most active tags
      orderBy: {
        usage: {
          _count: 'desc'
        }
      }
    });

    let totalChecked = 0;
    let inconsistentCount = 0;
    const issues: Array<{
      tenant: string;
      tagName: string;
      redisUsage: number;
      databaseUsage: number;
      discrepancy: number;
      discrepancyPercent: number;
    }> = [];

    for (const tag of activeTags) {
      // Get tenant info
      const tenant = await prisma.tenant.findUnique({
        where: { id: tag.tenantId }
      });
      
      if (!tenant) continue;

      // Use the queryTagUsage method which handles fallback logic properly
      const redisResults = await tracker.queryTagUsage({
        tenantId: tag.tenantId,
        tenant: tenant.name,
        tagIds: [tag.id],
        startDate,
        endDate,
        period: "custom"
      });

      const validation = await tracker.validateDataConsistency(
        tag.tenantId,
        tag.id,
        startDate,
        endDate
      );

      // Override redis usage with the proper query result
      const redisUsage = redisResults.length > 0 ? redisResults[0].totalUsage : 0;
      validation.redisUsage = redisUsage;
      validation.discrepancy = Math.abs(redisUsage - validation.databaseUsage);
      validation.discrepancyPercent = validation.databaseUsage > 0 ? (validation.discrepancy / validation.databaseUsage) * 100 : 0;
      validation.isConsistent = validation.discrepancy <= 0.001;

      totalChecked++;
      
      if (!validation.isConsistent) {
        inconsistentCount++;
        issues.push({
          tenant: tenant.name,
          tagName: tag.name,
          redisUsage: validation.redisUsage,
          databaseUsage: validation.databaseUsage,
          discrepancy: validation.discrepancy,
          discrepancyPercent: validation.discrepancyPercent
        });
      }

      console.log(
        `  ${tenant.name}/${tag.name}: ` +
        `Redis=$${validation.redisUsage.toFixed(6)}, ` +
        `DB=$${validation.databaseUsage.toFixed(6)}, ` +
        `Diff=$${validation.discrepancy.toFixed(6)} ` +
        `${validation.isConsistent ? '✅' : '❌'}`
      );
    }

    console.log(`\n📈 Summary:`);
    console.log(`  Tags checked: ${totalChecked}`);
    console.log(`  Consistent: ${totalChecked - inconsistentCount}`);
    console.log(`  Inconsistent: ${inconsistentCount}`);
    console.log(`  Accuracy: ${totalChecked > 0 ? ((totalChecked - inconsistentCount) / totalChecked * 100).toFixed(2) : 0}%`);

    if (issues.length > 0) {
      console.log(`\n⚠️  Consistency Issues Found:`);
      for (const issue of issues) {
        console.log(
          `  ${issue.tenant}/${issue.tagName}: ` +
          `${issue.discrepancyPercent.toFixed(2)}% difference ` +
          `(Redis: $${issue.redisUsage.toFixed(6)}, DB: $${issue.databaseUsage.toFixed(6)})`
        );
      }
      
      console.log(`\n🔧 Recommended Actions:`);
      if (inconsistentCount > totalChecked * 0.1) {
        console.log(`  - High inconsistency rate detected (${(inconsistentCount / totalChecked * 100).toFixed(1)}%)`);
        console.log(`  - Consider rebuilding Redis cache: npx tsx scripts/rebuild-redis-tag-usage.ts`);
      } else {
        console.log(`  - Minor inconsistencies detected`);
        console.log(`  - Monitor for pattern or investigate specific tags`);
      }
    } else {
      console.log(`\n✅ All tag usage data is consistent between Redis and database!`);
    }

  } catch (error) {
    console.error("❌ Error validating tag usage consistency:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await redis.disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateTagUsageConsistency();
}

export { validateTagUsageConsistency };