import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import {
  TagUsageTracker,
  createTagUsageTracker,
  TagUsageEvent,
  TagUsageQuery,
} from "../tag-usage-tracking.js";

// Mock Prisma
const mockPrisma = {
  requestTag: {
    findMany: vi.fn(),
  },
} as unknown as PrismaClient;

// Mock Redis client with comprehensive operations
const mockRedis = {
  multi: vi.fn(),
  get: vi.fn(),
  zRangeByScore: vi.fn(),
  zRangeWithScores: vi.fn(),
  keys: vi.fn(),
  scan: vi.fn(),
  zRemRangeByScore: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  zCard: vi.fn(),
  xTrim: vi.fn(),
} as unknown as ReturnType<typeof createClient>;

// Strongly typed helpers to avoid any
type RequestTagRecord = {
  weight: number;
  usage: { usd: { toString(): string } };
};

const redisGetMock = mockRedis.get as unknown as vi.Mock<
  Promise<string | null>,
  [string]
>;
const zRangeByScoreMock = mockRedis.zRangeByScore as unknown as vi.Mock<
  Promise<string[]>,
  [string, number, number]
>;
const redisKeysMock = mockRedis.keys as unknown as vi.Mock<
  Promise<string[]>,
  [string]
>;
const requestTagFindManyMock = mockPrisma.requestTag
  .findMany as unknown as vi.Mock<Promise<RequestTagRecord[]>, [unknown?]>;

// Mock pipeline
const mockPipeline = {
  xAdd: vi.fn().mockReturnThis(),
  zAdd: vi.fn().mockReturnThis(),
  incrByFloat: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  get: vi.fn().mockReturnThis(),
  zRemRangeByScore: vi.fn().mockReturnThis(),
  exec: vi.fn(),
};

// Strongly type the multi mock to avoid using 'any'
type PipelineType = typeof mockPipeline;
const redisMultiMock = mockRedis.multi as unknown as vi.Mock<PipelineType, []>;

describe("Tag Usage Tracking", () => {
  let tracker: TagUsageTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    redisMultiMock.mockReturnValue(mockPipeline); // replaced '(mockRedis.multi as any)'
    tracker = createTagUsageTracker(mockRedis, mockPrisma);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createTagUsageTracker", () => {
    it("should create a tracker instance", () => {
      const instance = createTagUsageTracker(mockRedis, mockPrisma);
      expect(instance).toBeInstanceOf(TagUsageTracker);
    });
  });

  describe("recordTagUsage", () => {
    const sampleEvent: TagUsageEvent = {
      tenantId: 1,
      tenant: "test-tenant",
      tagId: 123,
      tagName: "test-tag",
      usdAmount: 0.05,
      weight: 1.0,
      timestamp: new Date("2025-01-15T10:00:00Z"),
      usageLedgerId: 456,
      sessionId: "session-123",
      model: "gpt-4",
      route: "/v1/chat/completions",
    };

    it("should record tag usage with all Redis operations", async () => {
      mockPipeline.exec.mockResolvedValue([]);

      await tracker.recordTagUsage(sampleEvent);

      expect(mockRedis.multi).toHaveBeenCalled();
      expect(mockPipeline.xAdd).toHaveBeenCalledWith(
        "tag_usage_stream:1",
        "*",
        expect.objectContaining({
          timestamp: sampleEvent.timestamp.getTime().toString(),
        }),
      );

      expect(mockPipeline.zAdd).toHaveBeenCalledTimes(2); // daily and monthly
      expect(mockPipeline.incrByFloat).toHaveBeenCalledTimes(3); // real-time + 2 aggregated
      expect(mockPipeline.expire).toHaveBeenCalledTimes(5);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it("should handle Redis errors gracefully", async () => {
      mockPipeline.exec.mockRejectedValue(new Error("Redis connection failed"));

      await expect(tracker.recordTagUsage(sampleEvent)).rejects.toThrow(
        "Redis connection failed",
      );
    });

    it("should calculate weighted usage correctly", async () => {
      mockPipeline.exec.mockResolvedValue([]);

      const eventWithWeight: TagUsageEvent = {
        ...sampleEvent,
        usdAmount: 0.1,
        weight: 2.5,
      };

      await tracker.recordTagUsage(eventWithWeight);

      expect(mockPipeline.incrByFloat).toHaveBeenCalledWith(
        "tag_usage_rt:1:123",
        0.25, // 0.10 * 2.5
      );
    });
  });

  describe("queryTagUsage", () => {
    const sampleQuery: TagUsageQuery = {
      tenantId: 1,
      tenant: "test-tenant",
      tagIds: [123, 456],
      startDate: new Date("2025-01-15T00:00:00Z"),
      endDate: new Date("2025-01-15T23:59:59Z"),
      period: "daily",
    };

    it("should query tag usage with Redis fallback", async () => {
      // Mock aggregated cache miss
      redisGetMock.mockResolvedValue(null);

      // Mock sorted set query
      zRangeByScoreMock.mockResolvedValue([
        JSON.stringify({ usd: 0.05, weight: 1.0, ts: 1736938800000 }),
        JSON.stringify({ usd: 0.03, weight: 1.0, ts: 1736938900000 }),
      ]);

      const results = await tracker.queryTagUsage(sampleQuery);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        tagId: 123,
        totalUsage: 0.08,
        eventCount: 2,
        period: "daily",
        startDate: sampleQuery.startDate,
        endDate: sampleQuery.endDate,
      });
    });

    it("should use aggregated cache when available", async () => {
      redisGetMock
        .mockResolvedValueOnce("0.15") // tag 123 cache hit
        .mockResolvedValueOnce(null); // tag 456 cache miss

      zRangeByScoreMock.mockResolvedValueOnce([
        JSON.stringify({
          usd: 0.02,
          weight: 1.0,
          ts: sampleQuery.startDate.getTime() + 1000,
        }),
      ]);

      const results = await tracker.queryTagUsage(sampleQuery);

      expect(mockRedis.get).toHaveBeenCalledWith(
        "tag_usage_agg:1:123:daily:2025-01-15",
      );
      expect(results[0].totalUsage).toBe(0.15);
      expect(mockRedis.zRangeByScore).toHaveBeenCalledTimes(1);
      expect(mockRedis.zRangeByScore).toHaveBeenCalledWith(
        "tag_usage_zset:1:456:daily",
        sampleQuery.startDate.getTime(),
        sampleQuery.endDate.getTime(),
      );
    });

    it("should fallback to database when Redis fails", async () => {
      redisGetMock.mockRejectedValue(new Error("Redis error"));
      zRangeByScoreMock.mockRejectedValue(new Error("Redis error"));

      requestTagFindManyMock.mockResolvedValue([
        {
          weight: 1.0,
          usage: { usd: { toString: () => "0.10" } },
        },
      ]);

      const results = await tracker.queryTagUsage(sampleQuery);

      expect(results[0].totalUsage).toBe(0.1);
      expect(mockPrisma.requestTag.findMany).toHaveBeenCalled();
    });

    it("should handle errors gracefully and return zero usage", async () => {
      redisGetMock.mockRejectedValue(new Error("Redis error"));
      zRangeByScoreMock.mockRejectedValue(new Error("Redis error"));
      requestTagFindManyMock.mockRejectedValue(new Error("DB error"));

      const results = await tracker.queryTagUsage(sampleQuery);

      expect(results).toHaveLength(2);
      expect(results[0].totalUsage).toBe(0);
      expect(results[1].totalUsage).toBe(0);
    });
  });

  describe("getRealTimeUsage", () => {
    it("should get real-time usage from Redis", async () => {
      redisGetMock.mockResolvedValue("0.25");

      const usage = await tracker.getRealTimeUsage(1, 123);

      expect(usage).toBe(0.25);
      expect(mockRedis.get).toHaveBeenCalledWith("tag_usage_rt:1:123");
    });

    it("should return 0 when key doesn't exist", async () => {
      redisGetMock.mockResolvedValue(null);

      const usage = await tracker.getRealTimeUsage(1, 123);

      expect(usage).toBe(0);
    });

    it("should handle Redis errors gracefully", async () => {
      redisGetMock.mockRejectedValue(new Error("Redis error"));

      const usage = await tracker.getRealTimeUsage(1, 123);

      expect(usage).toBe(0);
    });
  });

  describe("batchQueryTagUsage", () => {
    it("should perform batch query efficiently", async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, "0.10"],
        [null, "0.15"],
        [null, null],
      ]);

      const results = await tracker.batchQueryTagUsage(
        1,
        [123, 456, 789],
        "daily",
      );

      expect(results).toEqual({
        123: 0.1,
        456: 0.15,
        789: 0,
      });

      expect(mockRedis.multi).toHaveBeenCalled();
      expect(mockPipeline.get).toHaveBeenCalledTimes(3);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it("should return empty object for empty tag list", async () => {
      const results = await tracker.batchQueryTagUsage(1, [], "daily");

      expect(results).toEqual({});
      expect(mockRedis.multi).not.toHaveBeenCalled();
    });

    it("should handle Redis errors by returning zeros", async () => {
      mockPipeline.exec.mockRejectedValue(new Error("Redis error"));

      const results = await tracker.batchQueryTagUsage(1, [123, 456], "daily");

      expect(results).toEqual({ 123: 0, 456: 0 });
    });
  });

  describe("cleanupOldUsageData", () => {
    it("should cleanup old data from sorted sets", async () => {
      redisKeysMock
        .mockResolvedValueOnce(["tag_usage_zset:1:123:daily"])
        .mockResolvedValueOnce(["tag_usage_zset:1:456:monthly"]);
      mockPipeline.exec.mockResolvedValue([]);

      await tracker.cleanupOldUsageData(30);

      expect(mockRedis.keys).toHaveBeenCalledWith("tag_usage_zset:*:daily");
      expect(mockRedis.keys).toHaveBeenCalledWith("tag_usage_zset:*:monthly");
      expect(mockPipeline.zRemRangeByScore).toHaveBeenCalledTimes(2);
    });

    it("should handle cleanup errors gracefully", async () => {
      redisKeysMock.mockRejectedValue(new Error("Redis error"));

      await expect(tracker.cleanupOldUsageData(30)).resolves.not.toThrow();
    });
  });

  describe("getUsageStatistics", () => {
    it("should return usage statistics grouped by date", async () => {
      zRangeByScoreMock.mockResolvedValue([
        JSON.stringify({ usd: 0.05, ts: 1736938800000 }),
        JSON.stringify({ usd: 0.03, ts: 1736938800000 }),
        JSON.stringify({ usd: 0.07, ts: 1736952400000 }),
      ]);

      const stats = await tracker.getUsageStatistics(1, 123, "daily", 30);

      expect(stats).toHaveLength(1);
      expect(stats[0].date).toBe("2025-01-15");
      expect(stats[0].events).toBe(3);
      expect(stats[0].usage).toBeCloseTo(0.15, 10); // tolerate FP representation
    });

    it("should handle parsing errors gracefully", async () => {
      zRangeByScoreMock.mockResolvedValue([
        "invalid-json",
        JSON.stringify({ usd: 0.05, ts: 1736938800000 }),
      ]);

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const stats = await tracker.getUsageStatistics(1, 123, "daily", 30);

      expect(stats).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Error parsing usage entry:",
        expect.any(SyntaxError),
      );

      consoleSpy.mockRestore();
    });

    it("should return empty array on Redis errors", async () => {
      zRangeByScoreMock.mockRejectedValue(new Error("Redis error"));

      const stats = await tracker.getUsageStatistics(1, 123, "daily", 30);

      expect(stats).toEqual([]);
    });
  });

  describe("Performance Scenarios", () => {
    it("should handle high-volume batch operations efficiently", async () => {
      const largeTagList = Array.from({ length: 1000 }, (_, i) => i + 1);
      const mockResults = largeTagList.map((id) => [
        null,
        (id * 0.01).toString(),
      ]);

      mockPipeline.exec.mockResolvedValue(mockResults);

      const startTime = Date.now();
      const results = await tracker.batchQueryTagUsage(
        1,
        largeTagList,
        "daily",
      );
      const endTime = Date.now();

      expect(Object.keys(results)).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(100); // Should be very fast
      expect(mockRedis.multi).toHaveBeenCalledTimes(1); // Single pipeline
    });

    it("should handle concurrent usage recording", async () => {
      mockPipeline.exec.mockResolvedValue([]);

      const events = Array.from({ length: 100 }, (_, i) => ({
        tenantId: 1,
        tenant: "test-tenant",
        tagId: i + 1,
        tagName: `tag-${i + 1}`,
        usdAmount: 0.01,
        weight: 1.0,
        timestamp: new Date(),
      }));

      const promises = events.map((event) => tracker.recordTagUsage(event));
      await Promise.all(promises);

      expect(mockRedis.multi).toHaveBeenCalledTimes(100);
      expect(mockPipeline.exec).toHaveBeenCalledTimes(100);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero usage amounts", async () => {
      mockPipeline.exec.mockResolvedValue([]);

      const zeroEvent: TagUsageEvent = {
        tenantId: 1,
        tenant: "test-tenant",
        tagId: 123,
        tagName: "test-tag",
        usdAmount: 0,
        weight: 1.0,
        timestamp: new Date(),
      };

      await tracker.recordTagUsage(zeroEvent);

      expect(mockPipeline.incrByFloat).toHaveBeenCalledWith(
        "tag_usage_rt:1:123",
        0,
      );
    });

    it("should handle very large usage amounts", async () => {
      mockPipeline.exec.mockResolvedValue([]);

      const largeEvent: TagUsageEvent = {
        tenantId: 1,
        tenant: "test-tenant",
        tagId: 123,
        tagName: "test-tag",
        usdAmount: 999999.99,
        weight: 1.0,
        timestamp: new Date(),
      };

      await tracker.recordTagUsage(largeEvent);

      expect(mockPipeline.incrByFloat).toHaveBeenCalledWith(
        "tag_usage_rt:1:123",
        999999.99,
      );
    });

    it("should handle query with future dates", async () => {
      const futureQuery: TagUsageQuery = {
        tenantId: 1,
        tenant: "test-tenant",
        tagIds: [123],
        startDate: new Date("2030-01-01"),
        endDate: new Date("2030-01-02"),
        period: "daily",
      };

      redisGetMock.mockResolvedValue(null);
      zRangeByScoreMock.mockResolvedValue([]);

      const results = await tracker.queryTagUsage(futureQuery);

      expect(results[0].totalUsage).toBe(0);
      expect(results[0].eventCount).toBe(0);
    });
  });
});
