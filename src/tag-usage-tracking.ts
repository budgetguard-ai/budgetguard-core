import { createClient } from "redis";
import { PrismaClient } from "@prisma/client";

// TTLs for different cache layers
const REAL_TIME_USAGE_TTL = 5 * 60; // 5 minutes for real-time data
const AGGREGATED_USAGE_TTL = 30 * 60; // 30 minutes for aggregated data

export interface TagUsageEvent {
  tenantId: number;
  tenant: string;
  tagId: number;
  tagName: string;
  usdAmount: number;
  weight: number;
  timestamp: Date;
  usageLedgerId?: number;
  sessionId?: string;
  model?: string;
  route?: string;
}

export interface TagUsageQuery {
  tenantId: number;
  tenant: string;
  tagIds: number[];
  startDate: Date;
  endDate: Date;
  period?: "daily" | "monthly" | "custom";
}

export interface TagUsageResult {
  tagId: number;
  totalUsage: number;
  eventCount: number;
  period: string;
  startDate: Date;
  endDate: Date;
}

/**
 * Enhanced tag usage tracking with Redis streams, sorted sets, and atomic operations
 */
export class TagUsageTracker {
  private redis: ReturnType<typeof createClient>;
  private prisma: PrismaClient;

  constructor(redis: ReturnType<typeof createClient>, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  // Generate cache keys
  private getUsageStreamKey(tenantId: number): string {
    return `tag_usage_stream:${tenantId}`;
  }

  private getUsageSortedSetKey(
    tenantId: number,
    tagId: number,
    period: string,
  ): string {
    return `tag_usage_zset:${tenantId}:${tagId}:${period}`;
  }

  private getAggregatedUsageKey(
    tenantId: number,
    tagId: number,
    period: string,
    date: string,
  ): string {
    return `tag_usage_agg:${tenantId}:${tagId}:${period}:${date}`;
  }

  private getRealTimeUsageKey(tenantId: number, tagId: number): string {
    return `tag_usage_rt:${tenantId}:${tagId}`;
  }

  /**
   * Record tag usage event atomically using Redis streams and sorted sets
   */
  async recordTagUsage(event: TagUsageEvent): Promise<void> {
    const fullEvent: TagUsageEvent = {
      ...event,
    };

    // Enhanced idempotency guard: prevent double-recording from multiple sources
    let idemKey: string;

    if (fullEvent.usageLedgerId) {
      // Primary idempotency key for worker-processed events
      idemKey = `tag_usage_event:${fullEvent.usageLedgerId}:${fullEvent.tagId}`;
    } else {
      // Fallback idempotency key for immediate server events (using hash to avoid delimiter collisions)
      const fallbackKeyObj = {
        timestamp: fullEvent.timestamp.getTime(),
        sessionId: fullEvent.sessionId || "nosession",
        tagId: fullEvent.tagId,
        tenantId: fullEvent.tenantId,
      };
      const fallbackKeyStr = JSON.stringify(fallbackKeyObj);
      const crypto = await import("crypto");
      const fallbackKeyHash = crypto
        .createHash("sha256")
        .update(fallbackKeyStr)
        .digest("hex");
      idemKey = `tag_usage_event_fallback:${fallbackKeyHash}`;
    }

    // NX means set only if not exists; PX sets a TTL (24h here – tune as needed)
    const setResult = await this.redis.set(idemKey, "1", {
      NX: true,
      PX: 24 * 60 * 60 * 1000,
    });
    if (setResult === null) {
      // Enhanced debug logging (only in development)
      if (process.env.NODE_ENV === "development") {
        console.debug(
          {
            usageLedgerId: fullEvent.usageLedgerId,
            tagId: fullEvent.tagId,
            sessionId: fullEvent.sessionId,
            idemKey: idemKey,
            source: fullEvent.usageLedgerId ? "worker" : "server",
          },
          "Duplicate tag usage event ignored",
        );
      }
      return; // Duplicate detected; abort before any increments
    }

    const timestamp = fullEvent.timestamp.getTime();
    const weightedUsage = fullEvent.usdAmount * fullEvent.weight;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.multi();

      // 1. Add to usage stream for audit trail and worker processing
      const streamKey = this.getUsageStreamKey(fullEvent.tenantId);
      pipeline.xAdd(streamKey, "*", {
        tagId: fullEvent.tagId.toString(),
        tagName: fullEvent.tagName,
        usdAmount: fullEvent.usdAmount.toString(),
        weight: fullEvent.weight.toString(),
        weightedUsage: weightedUsage.toString(),
        timestamp: timestamp.toString(),
        tenant: fullEvent.tenant,
        usageLedgerId: fullEvent.usageLedgerId?.toString() || "",
        sessionId: fullEvent.sessionId || "",
        model: fullEvent.model || "",
        route: fullEvent.route || "",
      });

      // 2. Add to sorted sets for time-based queries (score = timestamp)
      const dailyKey = this.getUsageSortedSetKey(
        fullEvent.tenantId,
        fullEvent.tagId,
        "daily",
      );
      const monthlyKey = this.getUsageSortedSetKey(
        fullEvent.tenantId,
        fullEvent.tagId,
        "monthly",
      );

      pipeline.zAdd(dailyKey, {
        score: timestamp,
        value: JSON.stringify({
          usd: weightedUsage,
          weight: fullEvent.weight,
          ts: timestamp,
          sessionId: fullEvent.sessionId,
          model: fullEvent.model,
        }),
      });

      pipeline.zAdd(monthlyKey, {
        score: timestamp,
        value: JSON.stringify({
          usd: weightedUsage,
          weight: fullEvent.weight,
          ts: timestamp,
          sessionId: fullEvent.sessionId,
          model: fullEvent.model,
        }),
      });

      // 3. Increment real-time usage counters
      const rtKey = this.getRealTimeUsageKey(
        fullEvent.tenantId,
        fullEvent.tagId,
      );
      pipeline.incrByFloat(rtKey, weightedUsage);
      pipeline.expire(rtKey, REAL_TIME_USAGE_TTL);

      // 4. Update aggregated usage for current day/month
      const now = new Date(timestamp);
      const dailyDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
      const monthlyDate = now.toISOString().slice(0, 7); // YYYY-MM

      const dailyAggKey = this.getAggregatedUsageKey(
        fullEvent.tenantId,
        fullEvent.tagId,
        "daily",
        dailyDate,
      );
      const monthlyAggKey = this.getAggregatedUsageKey(
        fullEvent.tenantId,
        fullEvent.tagId,
        "monthly",
        monthlyDate,
      );

      pipeline.incrByFloat(dailyAggKey, weightedUsage);
      pipeline.expire(dailyAggKey, AGGREGATED_USAGE_TTL);
      pipeline.incrByFloat(monthlyAggKey, weightedUsage);
      pipeline.expire(monthlyAggKey, AGGREGATED_USAGE_TTL);

      // 5. Set TTL on sorted sets to prevent unbounded growth
      pipeline.expire(dailyKey, 24 * 60 * 60); // 1 day
      pipeline.expire(monthlyKey, 32 * 24 * 60 * 60); // ~1 month

      // Execute all operations atomically
      await pipeline.exec();
    } catch (error) {
      console.error("Error recording tag usage:", error);
      throw error;
    }
  }

  /**
   * Query tag usage with efficient Redis operations and database fallback
   */
  async queryTagUsage(query: TagUsageQuery): Promise<TagUsageResult[]> {
    const results: TagUsageResult[] = [];

    for (const tagId of query.tagIds) {
      try {
        let totalUsage = 0;
        let eventCount = 0;

        // Try Redis sorted set first for better performance
        if (query.period === "daily" || query.period === "monthly") {
          const cachedResult = await this.getAggregatedUsageFromCache(
            query.tenantId,
            tagId,
            query.period,
            query.startDate,
            query.endDate,
          );

          if (cachedResult) {
            totalUsage = cachedResult.totalUsage;
            eventCount = cachedResult.eventCount;
          }
        }

        // Fallback to sorted set range query if aggregated cache miss
        if (totalUsage === 0) {
          const sortedSetResult = await this.getUsageFromSortedSet(
            query.tenantId,
            tagId,
            query.period || "daily",
            query.startDate,
            query.endDate,
          );

          if (sortedSetResult) {
            totalUsage = sortedSetResult.totalUsage;
            eventCount = sortedSetResult.eventCount;
          }
        }

        // Final fallback to database (cached in tag-cache.ts)
        if (totalUsage === 0) {
          totalUsage = await this.getUsageFromDatabase(
            query.tenantId,
            tagId,
            query.startDate,
            query.endDate,
          );
        }

        results.push({
          tagId,
          totalUsage,
          eventCount,
          period: query.period || "custom",
          startDate: query.startDate,
          endDate: query.endDate,
        });
      } catch (error) {
        console.error(`Error querying usage for tag ${tagId}:`, error);
        // Return zero usage on error to prevent blocking
        results.push({
          tagId,
          totalUsage: 0,
          eventCount: 0,
          period: query.period || "custom",
          startDate: query.startDate,
          endDate: query.endDate,
        });
      }
    }

    return results;
  }

  /**
   * Get real-time usage for immediate budget checks
   */
  async getRealTimeUsage(tenantId: number, tagId: number): Promise<number> {
    try {
      const key = this.getRealTimeUsageKey(tenantId, tagId);
      const usage = await this.redis.get(key);
      return usage ? parseFloat(usage) : 0;
    } catch (error) {
      console.warn("Error getting real-time tag usage:", error);
      return 0;
    }
  }

  /**
   * Batch query for multiple tags (optimized for budget checking)
   */
  async batchQueryTagUsage(
    tenantId: number,
    tagIds: number[],
    period: "daily" | "monthly",
    date?: Date,
  ): Promise<Record<number, number>> {
    const result: Record<number, number> = {};

    if (tagIds.length === 0) return result;

    try {
      const pipeline = this.redis.multi();
      const keys: string[] = [];

      // Build pipeline for batch query
      for (const tagId of tagIds) {
        const dateStr = (date || new Date())
          .toISOString()
          .slice(0, period === "daily" ? 10 : 7);
        const key = this.getAggregatedUsageKey(
          tenantId,
          tagId,
          period,
          dateStr,
        );
        keys.push(key);
        pipeline.get(key);
      }

      const results = await pipeline.exec();

      if (results) {
        for (let i = 0; i < tagIds.length; i++) {
          const usage = results[i];
          if (usage !== null && usage !== undefined) {
            result[tagIds[i]] = parseFloat(usage as unknown as string);
          } else {
            result[tagIds[i]] = 0;
          }
        }
      }
    } catch (error) {
      console.warn("Error in batch tag usage query:", error);
      // Initialize all to 0 on error
      for (const tagId of tagIds) {
        result[tagId] = 0;
      }
    }

    return result;
  }

  /**
   * Clean up old usage data to prevent memory leaks
   */
  async cleanupOldUsageData(daysToKeep: number = 30): Promise<void> {
    try {
      const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

      // Get all sorted set keys
      const patterns = ["tag_usage_zset:*:daily", "tag_usage_zset:*:monthly"];

      for (const pattern of patterns) {
        const keys = await this.redis.keys(pattern);

        if (keys.length > 0) {
          const pipeline = this.redis.multi();

          for (const key of keys) {
            // Remove entries older than cutoff
            pipeline.zRemRangeByScore(key, "-inf", cutoffTime);
          }

          await pipeline.exec();
        }
      }
    } catch (error) {
      console.warn("Error cleaning up old usage data:", error);
    }
  }

  // Private helper methods
  private async getAggregatedUsageFromCache(
    tenantId: number,
    tagId: number,
    period: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ totalUsage: number; eventCount: number } | null> {
    try {
      // For simple same-day/month queries, use aggregated cache
      if (this.isSamePeriod(startDate, endDate, period)) {
        const dateStr =
          period === "daily"
            ? startDate.toISOString().slice(0, 10)
            : startDate.toISOString().slice(0, 7);

        const key = this.getAggregatedUsageKey(
          tenantId,
          tagId,
          period,
          dateStr,
        );
        const usage = await this.redis.get(key);

        if (usage) {
          return {
            totalUsage: parseFloat(usage),
            eventCount: 1, // Approximation since we don't track count separately
          };
        }
      }
    } catch (error) {
      console.warn("Error getting aggregated usage from cache:", error);
    }

    return null;
  }

  private async getUsageFromSortedSet(
    tenantId: number,
    tagId: number,
    period: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ totalUsage: number; eventCount: number } | null> {
    try {
      const key = this.getUsageSortedSetKey(tenantId, tagId, period);
      const minScore = startDate.getTime();
      const maxScore = endDate.getTime();

      const entries = await this.redis.zRangeByScore(key, minScore, maxScore);

      let totalUsage = 0;
      let eventCount = 0;

      for (const entry of entries) {
        try {
          const data = JSON.parse(entry);
          totalUsage += data.usd || 0;
          eventCount++;
        } catch (parseError) {
          console.warn("Error parsing sorted set entry:", parseError);
        }
      }

      return eventCount > 0 ? { totalUsage, eventCount } : null;
    } catch (error) {
      console.warn("Error getting usage from sorted set:", error);
      return null;
    }
  }

  private async getUsageFromDatabase(
    tenantId: number,
    tagId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    try {
      const result = await this.prisma.requestTag.findMany({
        where: {
          tagId,
          usage: {
            tenantId,
            ts: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
        include: {
          usage: true,
        },
      });

      let totalUsage = 0;
      for (const requestTag of result) {
        const baseUsage = parseFloat(requestTag.usage.usd.toString());
        const weightedUsage = baseUsage * requestTag.weight;
        totalUsage += weightedUsage;
      }

      return totalUsage;
    } catch (error) {
      console.error("Error getting usage from database:", error);
      return 0;
    }
  }

  private isSamePeriod(
    startDate: Date,
    endDate: Date,
    period: string,
  ): boolean {
    // Use UTC to avoid timezone-related date boundary issues
    if (period === "daily") {
      return (
        startDate.getUTCFullYear() === endDate.getUTCFullYear() &&
        startDate.getUTCMonth() === endDate.getUTCMonth() &&
        startDate.getUTCDate() === endDate.getUTCDate()
      );
    } else if (period === "monthly") {
      return (
        startDate.getUTCFullYear() === endDate.getUTCFullYear() &&
        startDate.getUTCMonth() === endDate.getUTCMonth()
      );
    }
    return false;
  }

  /**
   * Get usage statistics for analytics
   */
  async getUsageStatistics(
    tenantId: number,
    tagId: number,
    period: "daily" | "monthly",
    days: number = 30,
  ): Promise<Array<{ date: string; usage: number; events: number }>> {
    const stats: Array<{ date: string; usage: number; events: number }> = [];

    try {
      const key = this.getUsageSortedSetKey(tenantId, tagId, period);
      const endTime = Date.now();
      const startTime = endTime - days * 24 * 60 * 60 * 1000;

      const entries = await this.redis.zRangeByScore(key, startTime, endTime);

      const dailyStats: Record<string, { usage: number; events: number }> = {};

      for (const entry of entries) {
        try {
          const data = JSON.parse(entry);
          const date = new Date(data.ts).toISOString().slice(0, 10);

          if (!dailyStats[date]) {
            dailyStats[date] = { usage: 0, events: 0 };
          }

          // Accumulate with normalized floating point arithmetic
          dailyStats[date].usage =
            Math.round((dailyStats[date].usage + (data.usd || 0)) * 100) / 100;
          dailyStats[date].events += 1;
        } catch (parseError) {
          console.warn("Error parsing usage entry:", parseError);
        }
      }

      for (const [date, data] of Object.entries(dailyStats)) {
        stats.push({
          date,
          usage: data.usage,
          events: data.events,
        });
      }

      stats.sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      console.error("Error getting usage statistics:", error);
    }

    return stats;
  }

  /**
   * Validate Redis vs Database consistency for monitoring
   * Returns discrepancy information for alerting
   */
  async validateDataConsistency(
    tenantId: number,
    tagId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    redisUsage: number;
    databaseUsage: number;
    discrepancy: number;
    discrepancyPercent: number;
    isConsistent: boolean;
    tolerance: number;
  }> {
    const tolerance = 0.001; // $0.001 tolerance for floating point precision

    try {
      // Get Redis usage via sorted set query
      const redisResult = await this.getUsageFromSortedSet(
        tenantId,
        tagId,
        "custom",
        startDate,
        endDate,
      );
      const redisUsage = redisResult?.totalUsage || 0;

      // Get database usage
      const databaseUsage = await this.getUsageFromDatabase(
        tenantId,
        tagId,
        startDate,
        endDate,
      );

      const discrepancy = Math.abs(redisUsage - databaseUsage);
      const discrepancyPercent =
        databaseUsage > 0 ? (discrepancy / databaseUsage) * 100 : 0;
      const isConsistent = discrepancy <= tolerance;

      if (!isConsistent) {
        console.warn(
          `Data consistency issue detected for tag ${tagId}: ` +
            `Redis=${redisUsage}, Database=${databaseUsage}, ` +
            `Discrepancy=${discrepancy} (${discrepancyPercent.toFixed(2)}%)`,
        );
      }

      return {
        redisUsage,
        databaseUsage,
        discrepancy,
        discrepancyPercent,
        isConsistent,
        tolerance,
      };
    } catch (error) {
      console.error("Error validating data consistency:", error);
      return {
        redisUsage: 0,
        databaseUsage: 0,
        discrepancy: 0,
        discrepancyPercent: 0,
        isConsistent: false,
        tolerance,
      };
    }
  }

  /**
   * Get idempotency statistics for monitoring duplicate prevention
   */
  async getIdempotencyStats(): Promise<{
    totalKeys: number;
    workerKeys: number;
    serverKeys: number;
    oldestKey: Date | null;
    newestKey: Date | null;
  }> {
    try {
      const workerKeys = await this.redis.keys("tag_usage_event:*");
      const serverKeys = await this.redis.keys("tag_usage_event_fallback:*");

      let oldestKey: Date | null = null;
      let newestKey: Date | null = null;

      // Sample a few keys to get age range
      const sampleKeys = [
        ...workerKeys.slice(0, 10),
        ...serverKeys.slice(0, 10),
      ];
      for (const key of sampleKeys) {
        try {
          const ttl = await this.redis.ttl(key);
          if (ttl > 0) {
            // TTL is 24h, so creation time is roughly now - (24h - ttl)
            const creationTime = new Date(
              Date.now() - (24 * 60 * 60 * 1000 - ttl * 1000),
            );
            if (!oldestKey || creationTime < oldestKey) {
              oldestKey = creationTime;
            }
            if (!newestKey || creationTime > newestKey) {
              newestKey = creationTime;
            }
          }
        } catch {
          // Ignore individual key errors
        }
      }

      return {
        totalKeys: workerKeys.length + serverKeys.length,
        workerKeys: workerKeys.length,
        serverKeys: serverKeys.length,
        oldestKey,
        newestKey,
      };
    } catch (error) {
      console.warn("Error getting idempotency stats:", error);
      return {
        totalKeys: 0,
        workerKeys: 0,
        serverKeys: 0,
        oldestKey: null,
        newestKey: null,
      };
    }
  }
}

// Helper function to create a tracker instance
export function createTagUsageTracker(
  redis: ReturnType<typeof createClient>,
  prisma: PrismaClient,
): TagUsageTracker {
  return new TagUsageTracker(redis, prisma);
}

// Types are already exported at the top of the file
