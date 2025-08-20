import { createClient } from "redis";
import { PrismaClient } from "@prisma/client";
import { createTagUsageTracker } from "./tag-usage-tracking.js";

/**
 * Cleanup service for tag usage data to prevent memory leaks and maintain performance
 */
export class TagUsageCleanup {
  private redis: ReturnType<typeof createClient>;
  private prisma: PrismaClient;
  private tracker: ReturnType<typeof createTagUsageTracker>;

  constructor(redis: ReturnType<typeof createClient>, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
    this.tracker = createTagUsageTracker(redis, prisma);
  }

  /**
   * Comprehensive cleanup of old tag usage data
   */
  async performFullCleanup(
    options: {
      daysToKeepSortedSets?: number;
      daysToKeepStreams?: number;
      daysToKeepAggregated?: number;
      batchSize?: number;
    } = {},
  ): Promise<void> {
    const {
      daysToKeepSortedSets = 30,
      daysToKeepStreams = 7,
      daysToKeepAggregated = 3,
      batchSize = 1000,
    } = options;

    console.log("Starting tag usage cleanup...");

    try {
      // 1. Clean up old entries in sorted sets
      await this.cleanupSortedSets(daysToKeepSortedSets, batchSize);

      // 2. Clean up old stream entries
      await this.cleanupStreams(daysToKeepStreams, batchSize);

      // 3. Clean up old aggregated data
      await this.cleanupAggregatedData(daysToKeepAggregated, batchSize);

      // 4. Clean up empty keys
      await this.cleanupEmptyKeys();

      console.log("Tag usage cleanup completed successfully");
    } catch (error) {
      console.error("Error during tag usage cleanup:", error);
      throw error;
    }
  }

  /**
   * Clean up old entries in sorted sets (time-based queries)
   */
  private async cleanupSortedSets(
    daysToKeep: number,
    batchSize: number,
  ): Promise<void> {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const patterns = ["tag_usage_zset:*:daily", "tag_usage_zset:*:monthly"];

    for (const pattern of patterns) {
      let cursor = "0";
      let processedKeys = 0;

      do {
        const result = await this.redis.scan(cursor, {
          MATCH: pattern,
          COUNT: batchSize,
        });

        cursor = result.cursor;
        const keys = result.keys;

        if (keys.length > 0) {
          const pipeline = this.redis.multi();

          for (const key of keys) {
            // Remove entries older than cutoff
            pipeline.zRemRangeByScore(key, "-inf", cutoffTime);
          }

          await pipeline.exec();
          processedKeys += keys.length;
        }
      } while (cursor !== "0");

      console.log(
        `Cleaned up ${processedKeys} sorted set keys for pattern: ${pattern}`,
      );
    }
  }

  /**
   * Clean up old stream entries
   */
  private async cleanupStreams(
    daysToKeep: number,
    batchSize: number,
  ): Promise<void> {
    const pattern = "tag_usage_stream:*";
    // (cutoffTime removed – current strategy trims by approximate length not timestamp)

    let cursor = "0";
    let processedStreams = 0;

    do {
      const result = await this.redis.scan(cursor, {
        MATCH: pattern,
        COUNT: batchSize,
      });

      cursor = result.cursor;
      const keys = result.keys;

      for (const key of keys) {
        try {
          // Use XTRIM to keep only recent entries
          // Configurable max entries based on expected load patterns
          const ESTIMATED_ENTRIES_PER_DAY = 24 * 60; // Default: ~1 entry per minute
          const maxLength = daysToKeep * ESTIMATED_ENTRIES_PER_DAY;
          await this.redis.xTrim(key, "MAXLEN", maxLength);
          processedStreams++;
        } catch (error) {
          console.warn(`Error trimming stream ${key}:`, error);
        }
      }
    } while (cursor !== "0");

    console.log(`Cleaned up ${processedStreams} usage streams`);
  }

  /**
   * Clean up old aggregated data
   */
  private async cleanupAggregatedData(
    daysToKeep: number,
    batchSize: number,
  ): Promise<void> {
    const patterns = [
      "tag_usage_agg:*:daily:*",
      "tag_usage_agg:*:monthly:*",
      "tag_usage_rt:*", // Real-time usage keys
    ];

    for (const pattern of patterns) {
      let cursor = "0";
      let processedKeys = 0;
      let deletedKeys = 0;

      do {
        const result = await this.redis.scan(cursor, {
          MATCH: pattern,
          COUNT: batchSize,
        });

        cursor = result.cursor;
        const keys = result.keys;

        if (keys.length > 0) {
          const pipeline = this.redis.multi();

          for (const key of keys) {
            // For aggregated keys, check if they're old based on the date in the key
            if (this.isAggregatedKeyOld(key, daysToKeep)) {
              pipeline.del(key);
              deletedKeys++;
            }
          }

          if (deletedKeys > 0) {
            await pipeline.exec();
          }
          processedKeys += keys.length;
        }
      } while (cursor !== "0");

      console.log(
        `Processed ${processedKeys} keys, deleted ${deletedKeys} old keys for pattern: ${pattern}`,
      );
    }
  }

  /**
   * Clean up keys that have become empty
   */
  private async cleanupEmptyKeys(): Promise<void> {
    const patterns = ["tag_usage_zset:*", "tag_usage_agg:*", "tag_usage_rt:*"];

    let totalDeleted = 0;

    for (const pattern of patterns) {
      let cursor = "0";
      let deletedCount = 0;

      do {
        const result = await this.redis.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });

        cursor = result.cursor;
        const keys = result.keys;

        for (const key of keys) {
          try {
            // Check if key is empty or expired
            const exists = await this.redis.exists(key);
            if (!exists) continue;

            let isEmpty = false;

            if (key.includes("zset")) {
              const count = await this.redis.zCard(key);
              isEmpty = count === 0;
            } else {
              const value = await this.redis.get(key);
              isEmpty = !value || value === "0";
            }

            if (isEmpty) {
              await this.redis.del(key);
              deletedCount++;
            }
          } catch (error) {
            console.warn(`Error checking/deleting key ${key}:`, error);
          }
        }
      } while (cursor !== "0");

      totalDeleted += deletedCount;
      if (deletedCount > 0) {
        console.log(
          `Deleted ${deletedCount} empty keys for pattern: ${pattern}`,
        );
      }
    }

    if (totalDeleted > 0) {
      console.log(`Total empty keys deleted: ${totalDeleted}`);
    }
  }

  /**
   * Check if an aggregated key is old based on the date in the key name
   */
  private isAggregatedKeyOld(key: string, daysToKeep: number): boolean {
    try {
      // Extract date from key like "tag_usage_agg:1:123:daily:2025-01-15"
      const parts = key.split(":");
      if (parts.length < 5) return false;

      const dateStr = parts[4]; // "2025-01-15" or "2025-01"
      const keyDate = new Date(dateStr);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      return keyDate < cutoffDate;
    } catch {
      // If we can't parse the date, don't delete the key
      return false;
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<{
    totalKeys: number;
    keysByPattern: Record<string, number>;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }> {
    const patterns = [
      "tag_usage_zset:*",
      "tag_usage_stream:*",
      "tag_usage_agg:*",
      "tag_usage_rt:*",
    ];

    const keysByPattern: Record<string, number> = {};
    let totalKeys = 0;
    let oldestTimestamp: number | null = null;
    let newestTimestamp: number | null = null;

    for (const pattern of patterns) {
      let cursor = "0";
      let patternCount = 0;

      do {
        const result = await this.redis.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });

        cursor = result.cursor;
        const keys = result.keys;
        patternCount += keys.length;

        // Sample some keys to find timestamp ranges
        for (const key of keys.slice(0, 10)) {
          try {
            if (key.includes("zset")) {
              const scores = await this.redis.zRangeWithScores(key, 0, 0);
              if (scores.length > 0) {
                const timestamp = scores[0].score;
                if (!oldestTimestamp || timestamp < oldestTimestamp) {
                  oldestTimestamp = timestamp;
                }
              }

              const latestScores = await this.redis.zRangeWithScores(
                key,
                -1,
                -1,
              );
              if (latestScores.length > 0) {
                const timestamp = latestScores[0].score;
                if (!newestTimestamp || timestamp > newestTimestamp) {
                  newestTimestamp = timestamp;
                }
              }
            }
          } catch {
            // Ignore errors when sampling
          }
        }
      } while (cursor !== "0");

      keysByPattern[pattern] = patternCount;
      totalKeys += patternCount;
    }

    return {
      totalKeys,
      keysByPattern,
      oldestEntry: oldestTimestamp ? new Date(oldestTimestamp) : null,
      newestEntry: newestTimestamp ? new Date(newestTimestamp) : null,
    };
  }

  /**
   * Schedule periodic cleanup (to be called from a cron job or similar)
   */
  static async schedulePeriodicCleanup(
    redis: ReturnType<typeof createClient>,
    prisma: PrismaClient,
    intervalHours: number = 24,
  ): Promise<void> {
    const cleanup = new TagUsageCleanup(redis, prisma);

    const runCleanup = async () => {
      try {
        console.log("Starting scheduled tag usage cleanup...");
        const stats = await cleanup.getCleanupStats();
        console.log("Pre-cleanup stats:", stats);

        await cleanup.performFullCleanup();

        const postStats = await cleanup.getCleanupStats();
        console.log("Post-cleanup stats:", postStats);
      } catch (error) {
        console.error("Scheduled tag usage cleanup failed:", error);
      }
    };

    // Run cleanup immediately
    await runCleanup();

    // Schedule recurring cleanup
    setInterval(runCleanup, intervalHours * 60 * 60 * 1000);
  }
}

// Helper function to create cleanup instance
export function createTagUsageCleanup(
  redis: ReturnType<typeof createClient>,
  prisma: PrismaClient,
): TagUsageCleanup {
  return new TagUsageCleanup(redis, prisma);
}
