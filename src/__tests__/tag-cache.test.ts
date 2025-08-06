import { describe, it, expect, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { RedisClientType } from "redis";
import {
  getCachedTags,
  validateAndCacheTagSet,
  invalidateTagCache,
  getCachedTagUsage,
  incrementTagUsage,
  cacheTagUsage,
  getTagUsageCacheKey,
} from "../tag-cache.js";

// Mock Redis client
const mockRedis = {
  get: vi.fn(),
  setEx: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  incrByFloat: vi.fn(),
};

// Mock Prisma client
const mockPrisma = {
  tag: {
    findMany: vi.fn(),
  },
} as unknown as PrismaClient;

// Mock data
const mockDbTags = [
  {
    id: 1,
    name: "engineering",
    tenantId: 1,
    level: 0,
    isActive: true,
    path: "engineering",
    parentId: null,
  },
  {
    id: 2,
    name: "frontend",
    tenantId: 1,
    level: 1,
    isActive: true,
    path: "engineering/frontend",
    parentId: 1,
  },
  {
    id: 3,
    name: "backend",
    tenantId: 1,
    level: 1,
    isActive: true,
    path: "engineering/backend",
    parentId: 1,
  },
  {
    id: 4,
    name: "production",
    tenantId: 1,
    level: 0,
    isActive: true,
    path: "production",
    parentId: null,
  },
];

const mockCachedTags = [
  {
    id: 1,
    name: "engineering",
    tenantId: 1,
    level: 0,
    isActive: true,
    path: "engineering",
    parentId: undefined,
  },
  {
    id: 2,
    name: "frontend",
    tenantId: 1,
    level: 1,
    isActive: true,
    path: "engineering/frontend",
    parentId: 1,
  },
  {
    id: 3,
    name: "backend",
    tenantId: 1,
    level: 1,
    isActive: true,
    path: "engineering/backend",
    parentId: 1,
  },
  {
    id: 4,
    name: "production",
    tenantId: 1,
    level: 0,
    isActive: true,
    path: "production",
    parentId: undefined,
  },
];

describe("Tag Cache System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCachedTags", () => {
    it("should return cached tags when cache hit", async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockCachedTags));

      const result = await getCachedTags(
        1,
        mockRedis as RedisClientType,
        mockPrisma,
      );

      expect(result).toEqual(mockCachedTags);
      expect(mockRedis.get).toHaveBeenCalledWith("tags:tenant:1");
      expect(mockPrisma.tag.findMany).not.toHaveBeenCalled();
    });

    it("should query database and cache result on cache miss", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.tag.findMany.mockResolvedValue(mockDbTags);
      mockRedis.setEx.mockResolvedValue("OK");

      const result = await getCachedTags(
        1,
        mockRedis as RedisClientType,
        mockPrisma,
      );

      expect(result).toEqual(mockCachedTags);
      expect(mockPrisma.tag.findMany).toHaveBeenCalledWith({
        where: { tenantId: 1, isActive: true },
        select: {
          id: true,
          name: true,
          tenantId: true,
          level: true,
          isActive: true,
          path: true,
          parentId: true,
        },
      });
      expect(mockRedis.setEx).toHaveBeenCalledWith(
        "tags:tenant:1",
        300,
        expect.any(String),
      );
    });

    it("should work without Redis", async () => {
      mockPrisma.tag.findMany.mockResolvedValue(mockDbTags);

      const result = await getCachedTags(1, undefined, mockPrisma);

      expect(result).toEqual(mockCachedTags);
      expect(mockPrisma.tag.findMany).toHaveBeenCalled();
    });

    it("should return empty array without Prisma", async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await getCachedTags(
        1,
        mockRedis as RedisClientType,
        undefined,
      );

      expect(result).toEqual([]);
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.get.mockRejectedValue(new Error("Redis connection failed"));
      mockPrisma.tag.findMany.mockResolvedValue(mockDbTags);

      const result = await getCachedTags(
        1,
        mockRedis as RedisClientType,
        mockPrisma,
      );

      expect(result).toEqual(mockCachedTags);
      expect(mockPrisma.tag.findMany).toHaveBeenCalled(); // Fallback to DB
    });

    it("should handle cache set errors gracefully", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.tag.findMany.mockResolvedValue(mockDbTags);
      mockRedis.setEx.mockRejectedValue(new Error("Redis set failed"));

      const result = await getCachedTags(
        1,
        mockRedis as RedisClientType,
        mockPrisma,
      );

      expect(result).toEqual(mockCachedTags); // Should still return results
    });
  });

  describe("validateAndCacheTagSet", () => {
    it("should return cached validation result when cache hit", async () => {
      const cachedResult = [
        { id: 1, name: "engineering", weight: 1.0 },
        { id: 4, name: "production", weight: 1.0 },
      ];

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await validateAndCacheTagSet(
        ["engineering", "production"],
        1,
        mockRedis as RedisClientType,
        mockPrisma,
      );

      expect(result).toEqual(cachedResult);
      expect(mockRedis.get).toHaveBeenCalledWith(
        "tagset:1:engineering,production",
      );
      expect(mockPrisma.tag.findMany).not.toHaveBeenCalled();
    });

    it("should validate tags and cache result on cache miss", async () => {
      mockRedis.get.mockResolvedValue(null); // Tag set cache miss
      mockRedis.get.mockResolvedValue(null); // All tags cache miss
      mockPrisma.tag.findMany.mockResolvedValue(mockDbTags);
      mockRedis.setEx.mockResolvedValue("OK");

      const result = await validateAndCacheTagSet(
        ["engineering", "production"],
        1,
        mockRedis as RedisClientType,
        mockPrisma,
      );

      expect(result).toEqual([
        { id: 1, name: "engineering", weight: 1.0 },
        { id: 4, name: "production", weight: 1.0 },
      ]);
      expect(mockRedis.setEx).toHaveBeenCalledWith(
        "tagset:1:engineering,production",
        120,
        expect.any(String),
      );
    });

    it("should throw error for missing tags", async () => {
      mockRedis.get.mockResolvedValue(null); // Tag set cache miss
      mockRedis.get.mockResolvedValue(null); // All tags cache miss
      mockPrisma.tag.findMany.mockResolvedValue([mockDbTags[0]]); // Only engineering tag

      await expect(
        validateAndCacheTagSet(
          ["engineering", "missing-tag"],
          1,
          mockRedis as RedisClientType,
          mockPrisma,
        ),
      ).rejects.toThrow("Tags not found for this tenant: missing-tag");
    });

    it("should handle empty tag list", async () => {
      const result = await validateAndCacheTagSet(
        [],
        1,
        mockRedis as RedisClientType,
        mockPrisma,
      );
      expect(result).toEqual([]);
    });

    it("should sort tag names for consistent cache keys", async () => {
      mockRedis.get.mockResolvedValue(null); // Tag set cache miss
      mockRedis.get.mockResolvedValue(null); // All tags cache miss
      mockPrisma.tag.findMany.mockResolvedValue([mockDbTags[0], mockDbTags[3]]);
      mockRedis.setEx.mockResolvedValue("OK");

      await validateAndCacheTagSet(
        ["production", "engineering"], // Different order
        1,
        mockRedis as RedisClientType,
        mockPrisma,
      );

      // Should use sorted order in cache key
      expect(mockRedis.get).toHaveBeenCalledWith(
        "tagset:1:engineering,production",
      );
    });

    it("should work without Redis", async () => {
      mockPrisma.tag.findMany.mockResolvedValue([mockDbTags[0]]);

      const result = await validateAndCacheTagSet(
        ["engineering"],
        1,
        undefined,
        mockPrisma,
      );

      expect(result).toEqual([{ id: 1, name: "engineering", weight: 1.0 }]);
    });
  });

  describe("invalidateTagCache", () => {
    it("should invalidate tenant and tagset caches", async () => {
      mockRedis.keys.mockResolvedValue(["tagset:1:tag1", "tagset:1:tag1,tag2"]);
      mockRedis.del.mockResolvedValue(1);

      await invalidateTagCache(1, mockRedis as RedisClientType);

      expect(mockRedis.del).toHaveBeenCalledWith("tags:tenant:1");
      expect(mockRedis.keys).toHaveBeenCalledWith("tagset:1:*");
      expect(mockRedis.del).toHaveBeenCalledWith([
        "tagset:1:tag1",
        "tagset:1:tag1,tag2",
      ]);
    });

    it("should handle no tagset keys to delete", async () => {
      mockRedis.keys.mockResolvedValue([]);
      mockRedis.del.mockResolvedValue(1);

      await invalidateTagCache(1, mockRedis as RedisClientType);

      expect(mockRedis.del).toHaveBeenCalledWith("tags:tenant:1");
      expect(mockRedis.keys).toHaveBeenCalledWith("tagset:1:*");
      expect(mockRedis.del).toHaveBeenCalledTimes(1); // Only called once for tenant cache
    });

    it("should work without Redis", async () => {
      await expect(invalidateTagCache(1, undefined)).resolves.not.toThrow();
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.del.mockRejectedValue(new Error("Redis error"));

      await expect(
        invalidateTagCache(1, mockRedis as RedisClientType),
      ).resolves.not.toThrow();
    });
  });

  describe("Tag Usage Caching", () => {
    const today = "2025-08-05";
    let dateSpyInstance: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Mock Date.now() to return consistent date
      dateSpyInstance = vi
        .spyOn(Date.prototype, "toISOString")
        .mockReturnValue(`${today}T00:00:00.000Z`);
    });

    describe("getTagUsageCacheKey", () => {
      it("should generate correct cache key", () => {
        const key = getTagUsageCacheKey("tenant1", 1, "daily");
        expect(key).toBe(`tag_usage:tenant1:1:daily:${today}`);
      });

      it("should handle custom date", () => {
        // Temporarily restore the real toISOString for this test
        dateSpyInstance.mockRestore();

        const customDate = new Date("2025-08-10T12:00:00.000Z");
        const key = getTagUsageCacheKey("tenant1", 1, "daily", customDate);
        expect(key).toBe("tag_usage:tenant1:1:daily:2025-08-10");

        // Re-mock for other tests
        dateSpyInstance = vi
          .spyOn(Date.prototype, "toISOString")
          .mockReturnValue(`${today}T00:00:00.000Z`);
      });
    });

    describe("cacheTagUsage", () => {
      it("should cache tag usage with default TTL", async () => {
        mockRedis.setEx.mockResolvedValue("OK");

        await cacheTagUsage(
          "tenant1",
          1,
          "daily",
          25.5,
          mockRedis as RedisClientType,
        );

        expect(mockRedis.setEx).toHaveBeenCalledWith(
          `tag_usage:tenant1:1:daily:${today}`,
          1800, // 30 minutes default
          "25.5",
        );
      });

      it("should cache tag usage with custom TTL", async () => {
        mockRedis.setEx.mockResolvedValue("OK");

        await cacheTagUsage(
          "tenant1",
          1,
          "monthly",
          100.25,
          mockRedis as RedisClientType,
          3600,
        );

        expect(mockRedis.setEx).toHaveBeenCalledWith(
          `tag_usage:tenant1:1:monthly:${today}`,
          3600,
          "100.25",
        );
      });

      it("should work without Redis", async () => {
        await expect(
          cacheTagUsage("tenant1", 1, "daily", 25.5, undefined),
        ).resolves.not.toThrow();
      });

      it("should handle Redis errors gracefully", async () => {
        mockRedis.setEx.mockRejectedValue(new Error("Redis error"));

        await expect(
          cacheTagUsage(
            "tenant1",
            1,
            "daily",
            25.5,
            mockRedis as RedisClientType,
          ),
        ).resolves.not.toThrow();
      });
    });

    describe("getCachedTagUsage", () => {
      it("should return cached usage when available", async () => {
        mockRedis.get.mockResolvedValue("25.50");

        const result = await getCachedTagUsage(
          "tenant1",
          1,
          "daily",
          mockRedis as RedisClientType,
        );

        expect(result).toBe(25.5);
        expect(mockRedis.get).toHaveBeenCalledWith(
          `tag_usage:tenant1:1:daily:${today}`,
        );
      });

      it("should return null when cache miss", async () => {
        mockRedis.get.mockResolvedValue(null);

        const result = await getCachedTagUsage(
          "tenant1",
          1,
          "daily",
          mockRedis as RedisClientType,
        );

        expect(result).toBe(null);
      });

      it("should return null without Redis", async () => {
        const result = await getCachedTagUsage(
          "tenant1",
          1,
          "daily",
          undefined,
        );
        expect(result).toBe(null);
      });

      it("should handle Redis errors gracefully", async () => {
        mockRedis.get.mockRejectedValue(new Error("Redis error"));

        const result = await getCachedTagUsage(
          "tenant1",
          1,
          "daily",
          mockRedis as RedisClientType,
        );

        expect(result).toBe(null);
      });
    });

    describe("incrementTagUsage", () => {
      it("should increment usage atomically with existing TTL", async () => {
        mockRedis.ttl.mockResolvedValue(300); // Key already has TTL

        await incrementTagUsage(
          "tenant1",
          1,
          "daily",
          5.25,
          mockRedis as RedisClientType,
        );

        expect(mockRedis.incrByFloat).toHaveBeenCalledWith(
          `tag_usage:tenant1:1:daily:${today}`,
          5.25,
        );
        expect(mockRedis.expire).not.toHaveBeenCalled(); // TTL already set
      });

      it("should set TTL for new keys", async () => {
        mockRedis.ttl.mockResolvedValue(-1); // No TTL set

        await incrementTagUsage(
          "tenant1",
          1,
          "daily",
          5.25,
          mockRedis as RedisClientType,
          1800,
        );

        expect(mockRedis.incrByFloat).toHaveBeenCalled();
        expect(mockRedis.expire).toHaveBeenCalledWith(
          `tag_usage:tenant1:1:daily:${today}`,
          1800,
        );
      });

      it("should work without Redis", async () => {
        await expect(
          incrementTagUsage("tenant1", 1, "daily", 5.25, undefined),
        ).resolves.not.toThrow();
      });

      it("should handle Redis errors gracefully", async () => {
        mockRedis.incrByFloat.mockRejectedValue(new Error("Redis error"));

        await expect(
          incrementTagUsage(
            "tenant1",
            1,
            "daily",
            5.25,
            mockRedis as RedisClientType,
          ),
        ).resolves.not.toThrow();
      });
    });
  });

  describe("Performance and Edge Cases", () => {
    it("should handle large numbers of tags", async () => {
      const largeMockDbTags = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `tag-${i + 1}`,
        tenantId: 1,
        level: 0,
        isActive: true,
        path: `tag-${i + 1}`,
        parentId: null,
      }));

      mockRedis.get.mockResolvedValue(null);
      mockPrisma.tag.findMany.mockResolvedValue(largeMockDbTags);
      mockRedis.setEx.mockResolvedValue("OK");

      const result = await getCachedTags(
        1,
        mockRedis as RedisClientType,
        mockPrisma,
      );

      expect(result).toHaveLength(100);
      expect(mockRedis.setEx).toHaveBeenCalled();
    });

    it("should handle special characters in tag names", async () => {
      const specialTags = [
        {
          id: 1,
          name: "tag-with-dashes",
          tenantId: 1,
          level: 0,
          isActive: true,
          path: "tag-with-dashes",
          parentId: null,
        },
        {
          id: 2,
          name: "tag_with_underscores",
          tenantId: 1,
          level: 0,
          isActive: true,
          path: "tag_with_underscores",
          parentId: null,
        },
        {
          id: 3,
          name: "tag.with.dots",
          tenantId: 1,
          level: 0,
          isActive: true,
          path: "tag.with.dots",
          parentId: null,
        },
      ];

      mockRedis.get.mockResolvedValue(null); // Tag set cache miss
      mockRedis.get.mockResolvedValue(null); // All tags cache miss
      mockPrisma.tag.findMany.mockResolvedValue(specialTags);
      mockRedis.setEx.mockResolvedValue("OK");

      const result = await validateAndCacheTagSet(
        ["tag-with-dashes", "tag_with_underscores", "tag.with.dots"],
        1,
        mockRedis as RedisClientType,
        mockPrisma,
      );

      expect(result).toHaveLength(3);
      expect(result.map((t) => t.name)).toContain("tag-with-dashes");
      expect(result.map((t) => t.name)).toContain("tag_with_underscores");
      expect(result.map((t) => t.name)).toContain("tag.with.dots");
    });

    it("should handle concurrent cache operations", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.tag.findMany.mockResolvedValue([mockDbTags[0]]);
      mockRedis.setEx.mockResolvedValue("OK");

      // Simulate concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        getCachedTags(1, mockRedis as RedisClientType, mockPrisma),
      );

      const results = await Promise.all(promises);

      // All should return the same result
      results.forEach((result) => {
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("engineering");
      });
    });
  });
});
