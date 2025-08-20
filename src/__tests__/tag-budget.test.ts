import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import {
  getCachedTagBudgets,
  invalidateTagBudgetCache,
  getTagBudgetCacheKey,
} from "../tag-budget.js";

// Define typed mocks to avoid 'any'
type PrismaMock = {
  tagBudget: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

type RedisMock = {
  get: ReturnType<typeof vi.fn>;
  setEx: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

// Mock Prisma
const mockPrisma: PrismaMock = {
  tagBudget: {
    findMany: vi.fn(),
  },
};

// Mock Redis client
const mockRedis: RedisMock = {
  get: vi.fn(),
  setEx: vi.fn(),
  del: vi.fn(),
};

describe("Tag Budget Cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTagBudgetCacheKey", () => {
    it("should generate correct cache key", () => {
      const key = getTagBudgetCacheKey(123);
      expect(key).toBe("tag_session_budget:123");
    });
  });

  describe("getCachedTagBudgets", () => {
    const sampleTagBudget = {
      id: 1,
      tagId: 123,
      period: "monthly",
      amountUsd: { toString: () => "100.50" },
      weight: 1.0,
      inheritanceMode: "STRICT",
      startDate: null,
      endDate: null,
      isActive: true,
      tag: { id: 123, name: "test-tag" },
    };

    it("should return cached data when available", async () => {
      const cachedData = [
        {
          id: 1,
          tagId: 123,
          period: "monthly",
          amountUsd: "100.50",
          weight: 1.0,
          inheritanceMode: "STRICT",
          startDate: undefined,
          endDate: undefined,
          isActive: true,
          tag: { id: 123, name: "test-tag" },
        },
      ];

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await getCachedTagBudgets(
        123,
        mockRedis as unknown as ReturnType<typeof createClient>,
        mockPrisma as unknown as PrismaClient,
      );

      expect(mockRedis.get).toHaveBeenCalledWith("tag_session_budget:123");
      expect(mockPrisma.tagBudget.findMany).not.toHaveBeenCalled();
      expect(result).toEqual(cachedData);
    });

    it("should fallback to database when cache miss", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.tagBudget.findMany.mockResolvedValue([sampleTagBudget]);

      const result = await getCachedTagBudgets(
        123,
        mockRedis as unknown as ReturnType<typeof createClient>,
        mockPrisma as unknown as PrismaClient,
      );

      expect(mockRedis.get).toHaveBeenCalledWith("tag_session_budget:123");
      expect(mockPrisma.tagBudget.findMany).toHaveBeenCalledWith({
        where: { tagId: 123, isActive: true },
        include: { tag: true },
      });
      expect(mockRedis.setEx).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].amountUsd).toBe("100.50");
    });

    it("should fallback to database when no redis", async () => {
      mockPrisma.tagBudget.findMany.mockResolvedValue([sampleTagBudget]);

      const result = await getCachedTagBudgets(
        123,
        undefined,
        mockPrisma as unknown as PrismaClient,
      );

      expect(mockPrisma.tagBudget.findMany).toHaveBeenCalledWith({
        where: { tagId: 123, isActive: true },
        include: { tag: true },
      });
      expect(result).toHaveLength(1);
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.get.mockRejectedValue(new Error("Redis connection failed"));
      mockPrisma.tagBudget.findMany.mockResolvedValue([sampleTagBudget]);

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await getCachedTagBudgets(
        123,
        mockRedis as unknown as ReturnType<typeof createClient>,
        mockPrisma as unknown as PrismaClient,
      );

      expect(result).toHaveLength(1);
      expect(mockPrisma.tagBudget.findMany).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Redis error fetching tag budget config:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("should handle cache set errors gracefully", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setEx.mockRejectedValue(new Error("Redis set failed"));
      mockPrisma.tagBudget.findMany.mockResolvedValue([sampleTagBudget]);

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await getCachedTagBudgets(
        123,
        mockRedis as unknown as ReturnType<typeof createClient>,
        mockPrisma as unknown as PrismaClient,
      );

      expect(result).toHaveLength(1);
      expect(mockPrisma.tagBudget.findMany).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Redis error caching tag budget config:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("should return empty array when no prisma provided", async () => {
      const result = await getCachedTagBudgets(123, undefined, undefined);
      expect(result).toEqual([]);
    });
  });

  describe("invalidateTagBudgetCache", () => {
    it("should delete cache key", async () => {
      await invalidateTagBudgetCache(
        123,
        mockRedis as unknown as ReturnType<typeof createClient>,
      );
      expect(mockRedis.del).toHaveBeenCalledWith("tag_session_budget:123");
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.del.mockRejectedValue(new Error("Redis error"));
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(
        invalidateTagBudgetCache(
          123,
          mockRedis as unknown as ReturnType<typeof createClient>,
        ),
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Redis error invalidating tag budget cache:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("should do nothing when no redis", async () => {
      await invalidateTagBudgetCache(123, undefined);
    });
  });
});
