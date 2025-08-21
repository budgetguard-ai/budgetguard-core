#!/usr/bin/env npx tsx

import { createClient } from "redis";

/**
 * Clear all Redis tag usage data to eliminate double-counting corruption
 * This script removes:
 * - tag_usage_stream:* (usage streams)
 * - tag_usage_zset:* (sorted sets)  
 * - tag_usage_agg:* (aggregated usage)
 * - tag_usage_rt:* (real-time usage)
 * - tag_usage_event:* (idempotency keys)
 */
async function clearRedisTagUsage() {
  const redis = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
  });

  try {
    await redis.connect();
    console.log("Connected to Redis");

    const patterns = [
      "tag_usage_stream:*",
      "tag_usage_zset:*",
      "tag_usage_agg:*", 
      "tag_usage_rt:*",
      "tag_usage_event:*"
    ];

    for (const pattern of patterns) {
      console.log(`Scanning for keys matching pattern: ${pattern}`);
      const keys = await redis.keys(pattern);
      console.log(`Found ${keys.length} keys`);

      if (keys.length > 0) {
        const deleted = await redis.del(keys);
        console.log(`Deleted ${deleted} keys for pattern ${pattern}`);
      }
    }

    console.log("✅ Successfully cleared all Redis tag usage data");
  } catch (error) {
    console.error("❌ Error clearing Redis tag usage data:", error);
    process.exit(1);
  } finally {
    await redis.disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  clearRedisTagUsage();
}

export { clearRedisTagUsage };