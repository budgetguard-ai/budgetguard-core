import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import {
  getCachedTagBudgets,
  invalidateTagBudgetCache,
  getTagBudgetCacheKey,
} from "../tag-budget.js";

// Mock Prisma
const mockPrisma = {
  tagBudget: {
    findMany: vi.fn(),
  },
} as unknown as PrismaClient;

// Mock Redis client
const mockRedis = {
  get: vi.fn(),
  setEx: vi.fn(),
  del: vi.fn(),
} as unknown as ReturnType<typeof createClient>;

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

      (mockRedis.get as any).mockResolvedValue(JSON.stringify(cachedData));

      const result = await getCachedTagBudgets(123, mockRedis, mockPrisma);

      expect(mockRedis.get).toHaveBeenCalledWith("tag_session_budget:123");
      expect(mockPrisma.tagBudget.findMany).not.toHaveBeenCalled();
      expect(result).toEqual(cachedData);
    });

    it("should fallback to database when cache miss", async () => {
      (mockRedis.get as any).mockResolvedValue(null);
      (mockPrisma.tagBudget.findMany as any).mockResolvedValue([sampleTagBudget]);

      const result = await getCachedTagBudgets(123, mockRedis, mockPrisma);

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
      (mockPrisma.tagBudget.findMany as any).mockResolvedValue([sampleTagBudget]);

      const result = await getCachedTagBudgets(123, undefined, mockPrisma);

      expect(mockPrisma.tagBudget.findMany).toHaveBeenCalledWith({
        where: { tagId: 123, isActive: true },
        include: { tag: true },
      });
      expect(result).toHaveLength(1);
    });

    it("should handle Redis errors gracefully", async () => {
      (mockRedis.get as any).mockRejectedValue(new Error("Redis connection failed"));
      (mockPrisma.tagBudget.findMany as any).mockResolvedValue([sampleTagBudget]);

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await getCachedTagBudgets(123, mockRedis, mockPrisma);

      expect(result).toHaveLength(1);
      expect(mockPrisma.tagBudget.findMany).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Redis error fetching tag budget config:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("should handle cache set errors gracefully", async () => {
      (mockRedis.get as any).mockResolvedValue(null);
      (mockRedis.setEx as any).mockRejectedValue(new Error("Redis set failed"));
      (mockPrisma.tagBudget.findMany as any).mockResolvedValue([sampleTagBudget]);

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await getCachedTagBudgets(123, mockRedis, mockPrisma);

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
      await invalidateTagBudgetCache(123, mockRedis);
      expect(mockRedis.del).toHaveBeenCalledWith("tag_session_budget:123");
    });

    it("should handle Redis errors gracefully", async () => {
      (mockRedis.del as any).mockRejectedValue(new Error("Redis error"));
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      
      // Should not throw
      await expect(
        invalidateTagBudgetCache(123, mockRedis),
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Redis error invalidating tag budget cache:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("should do nothing when no redis", async () => {
      await invalidateTagBudgetCache(123, undefined);
      // Should not throw and complete successfully
    });
  });
});