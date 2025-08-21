import { describe, it, expect, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { RedisClientType } from "redis";

// Mock Redis client
const mockRedis = {
  get: vi.fn(),
  setEx: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  incrByFloat: vi.fn(),
  mGet: vi.fn(),
};

// Mock Prisma client
const mockPrisma = {
  tag: {
    findMany: vi.fn(),
  },
} as unknown as PrismaClient;

// Mock data
const mockTags = [
  {
    id: 1,
    name: "engineering",
    tenantId: 1,
    isActive: true,
    level: 0,
    path: "engineering",
    parentId: null,
  },
  {
    id: 2,
    name: "frontend",
    tenantId: 1,
    isActive: true,
    level: 1,
    path: "engineering/frontend",
    parentId: 1,
  },
  {
    id: 3,
    name: "backend",
    tenantId: 1,
    isActive: true,
    level: 1,
    path: "engineering/backend",
    parentId: 1,
  },
  {
    id: 4,
    name: "production",
    tenantId: 1,
    isActive: true,
    level: 0,
    path: "production",
    parentId: null,
  },
  {
    id: 5,
    name: "staging",
    tenantId: 1,
    isActive: true,
    level: 0,
    path: "staging",
    parentId: null,
  },
];

const mockTagsForTenant2 = [
  {
    id: 6,
    name: "engineering",
    tenantId: 2,
    isActive: true,
    level: 0,
    path: "engineering",
    parentId: null,
  },
  {
    id: 7,
    name: "marketing",
    tenantId: 2,
    isActive: true,
    level: 0,
    path: "marketing",
    parentId: null,
  },
];

describe("Tag Validation System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractAndValidateTags function", () => {
    it("should return empty array when no tags header provided", async () => {
      const { extractAndValidateTags } = await import("../server.js");

      const result = await extractAndValidateTags(
        {},
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      expect(result).toEqual([]);
      expect(mockPrisma.tag.findMany).not.toHaveBeenCalled();
    });

    it("should return empty array when tags header is empty", async () => {
      const { extractAndValidateTags } = await import("../server.js");

      const result = await extractAndValidateTags(
        { "x-tags": "" },
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      expect(result).toEqual([]);
      expect(mockPrisma.tag.findMany).not.toHaveBeenCalled();
    });

    it("should validate single tag for tenant", async () => {
      // Mock Redis cache miss for tag set
      mockRedis.get.mockResolvedValueOnce(null);

      // Mock Redis cache miss for all tags, then database response
      mockRedis.get.mockResolvedValueOnce(null);
      mockPrisma.tag.findMany.mockResolvedValue([mockTags[0]]); // Only engineering tag

      // Mock Redis cache set operations
      mockRedis.setEx.mockResolvedValue("OK");

      const { extractAndValidateTags } = await import("../server.js");

      const result = await extractAndValidateTags(
        { "x-tags": "engineering" },
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      expect(result).toEqual([{ id: 1, name: "engineering", weight: 1.0 }]);

      // Verify database was queried for all tenant tags
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
    });

    it("should validate multiple tags for tenant", async () => {
      // Mock Redis cache miss for tag set
      mockRedis.get.mockResolvedValueOnce(null);

      // Mock Redis cache miss for all tags, then database response
      mockRedis.get.mockResolvedValueOnce(null);
      mockPrisma.tag.findMany.mockResolvedValue(mockTags.slice(0, 3)); // engineering, frontend, backend

      mockRedis.setEx.mockResolvedValue("OK");

      const { extractAndValidateTags } = await import("../server.js");

      const result = await extractAndValidateTags(
        { "x-tags": "engineering,frontend,backend" },
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      expect(result).toHaveLength(3);
      const tagNames = result.map((t) => t.name);
      expect(tagNames).toContain("engineering");
      expect(tagNames).toContain("frontend");
      expect(tagNames).toContain("backend");
      expect(result.every((t) => t.weight === 1.0)).toBe(true);
    });

    it("should handle whitespace in tag names", async () => {
      // Mock Redis cache miss for tag set
      mockRedis.get.mockResolvedValueOnce(null);

      // Mock Redis cache miss for all tags, then database response
      mockRedis.get.mockResolvedValueOnce(null);
      mockPrisma.tag.findMany.mockResolvedValue([mockTags[0], mockTags[3]]); // engineering, production

      mockRedis.setEx.mockResolvedValue("OK");

      const { extractAndValidateTags } = await import("../server.js");

      const result = await extractAndValidateTags(
        { "x-tags": " engineering , production " },
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.name).sort()).toEqual([
        "engineering",
        "production",
      ]);
    });

    it("should ignore empty tag names from comma separation", async () => {
      // Mock Redis cache miss for tag set
      mockRedis.get.mockResolvedValueOnce(null);

      // Mock Redis cache miss for all tags, then database response
      mockRedis.get.mockResolvedValueOnce(null);
      mockPrisma.tag.findMany.mockResolvedValue([mockTags[0]]); // Only engineering

      mockRedis.setEx.mockResolvedValue("OK");

      const { extractAndValidateTags } = await import("../server.js");

      const result = await extractAndValidateTags(
        { "x-tags": "engineering,,," },
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("engineering");
    });

    it("should throw error when tags not found for tenant", async () => {
      // Mock Redis cache miss for tag set
      mockRedis.get.mockResolvedValueOnce(null);

      // Mock Redis cache miss for all tags, then database response with only one tag
      mockRedis.get.mockResolvedValueOnce(null);
      mockPrisma.tag.findMany.mockResolvedValue([mockTags[0]]); // Only engineering tag

      mockRedis.setEx.mockResolvedValue("OK");

      const { extractAndValidateTags } = await import("../server.js");

      await expect(
        extractAndValidateTags(
          { "x-tags": "engineering,missing-tag" },
          1,
          mockPrisma,
          mockRedis as RedisClientType,
        ),
      ).rejects.toThrow("Tags not found for this tenant: missing-tag");
    });

    it("should enforce tenant isolation", async () => {
      // Mock Redis cache miss for tag set
      mockRedis.get.mockResolvedValueOnce(null);

      // Mock Redis cache miss for all tags, then database response for tenant 2
      mockRedis.get.mockResolvedValueOnce(null);
      mockPrisma.tag.findMany.mockResolvedValue(mockTagsForTenant2);

      mockRedis.setEx.mockResolvedValue("OK");

      const { extractAndValidateTags } = await import("../server.js");

      const result = await extractAndValidateTags(
        { "x-tags": "engineering,marketing" },
        2, // Different tenant
        mockPrisma,
        mockRedis as RedisClientType,
      );

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.name).sort()).toEqual([
        "engineering",
        "marketing",
      ]);

      // Verify database was queried for tenant 2 specifically
      expect(mockPrisma.tag.findMany).toHaveBeenCalledWith({
        where: { tenantId: 2, isActive: true },
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
    });

    it("should prevent cross-tenant tag access", async () => {
      // Mock Redis cache miss for tag set
      mockRedis.get.mockResolvedValueOnce(null);

      // Mock Redis cache miss for all tags, then empty database response (no tags for tenant 2)
      mockRedis.get.mockResolvedValueOnce(null);
      mockPrisma.tag.findMany.mockResolvedValue([]); // No tags found for tenant

      const { extractAndValidateTags } = await import("../server.js");

      // Try to use tenant 1's tags while authenticated as tenant 2
      await expect(
        extractAndValidateTags(
          { "x-tags": "frontend,backend" }, // These exist for tenant 1
          2, // But we're authenticated as tenant 2
          mockPrisma,
          mockRedis as RedisClientType,
        ),
      ).rejects.toThrow("Tags not found for this tenant: frontend, backend");
    });
  });

  describe("Redis Caching", () => {
    it("should use cached tag set when available", async () => {
      const cachedResult = [
        { id: 1, name: "engineering", weight: 1.0 },
        { id: 4, name: "production", weight: 1.0 },
      ];

      // Mock Redis cache hit for tag set
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedResult));

      const { extractAndValidateTags } = await import("../server.js");

      const result = await extractAndValidateTags(
        { "x-tags": "engineering,production" },
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      expect(result).toEqual(cachedResult);
      expect(mockPrisma.tag.findMany).not.toHaveBeenCalled(); // Should not hit database
    });

    it("should cache validated tag sets", async () => {
      // Mock Redis cache miss for tag set
      mockRedis.get.mockResolvedValueOnce(null);

      // Mock Redis cache miss for all tags, then database response
      mockRedis.get.mockResolvedValueOnce(null);
      mockPrisma.tag.findMany.mockResolvedValue([mockTags[0], mockTags[3]]);

      mockRedis.setEx.mockResolvedValue("OK");

      const { extractAndValidateTags } = await import("../server.js");

      await extractAndValidateTags(
        { "x-tags": "engineering,production" },
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      // Verify tag set was cached with correct TTL (2 minutes = 120 seconds)
      expect(mockRedis.setEx).toHaveBeenCalledWith(
        "tagset:1:engineering,production",
        120,
        expect.any(String),
      );
    });

    it("should work without Redis", async () => {
      // Mock database response
      mockPrisma.tag.findMany.mockResolvedValue([mockTags[0]]);

      const { extractAndValidateTags } = await import("../server.js");

      const result = await extractAndValidateTags(
        { "x-tags": "engineering" },
        1,
        mockPrisma,
        undefined, // No Redis client
      );

      expect(result).toEqual([{ id: 1, name: "engineering", weight: 1.0 }]);
      expect(mockPrisma.tag.findMany).toHaveBeenCalled();
    });

    it("should handle Redis errors gracefully", async () => {
      // Mock Redis error on cache read
      mockRedis.get.mockRejectedValue(new Error("Redis connection failed"));

      // Mock database response
      mockPrisma.tag.findMany.mockResolvedValue([mockTags[0]]);

      const { extractAndValidateTags } = await import("../server.js");

      const result = await extractAndValidateTags(
        { "x-tags": "engineering" },
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      expect(result).toEqual([{ id: 1, name: "engineering", weight: 1.0 }]);
      expect(mockPrisma.tag.findMany).toHaveBeenCalled(); // Should fallback to database
    });
  });

  describe("Header Parsing", () => {
    it("should handle case-insensitive header names", async () => {
      const { extractAndValidateTags } = await import("../server.js");

      const result1 = await extractAndValidateTags(
        { "x-tags": "" },
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      const result2 = await extractAndValidateTags(
        { "X-Tags": "" },
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      const result3 = await extractAndValidateTags(
        { "X-TAGS": "" },
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      expect(result1).toEqual([]);
      expect(result2).toEqual([]);
      expect(result3).toEqual([]);
    });

    it("should handle array header values", async () => {
      // Mock Redis cache misses
      mockRedis.get.mockResolvedValueOnce(null); // Tag set cache miss
      mockRedis.get.mockResolvedValueOnce(null); // All tags cache miss
      mockPrisma.tag.findMany.mockResolvedValue([mockTags[0], mockTags[3]]); // engineering, production
      mockRedis.setEx.mockResolvedValue("OK");

      const { extractAndValidateTags } = await import("../server.js");

      const result = await extractAndValidateTags(
        { "x-tags": ["engineering,production"] }, // Array with first element as comma-separated string
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      expect(result).toHaveLength(2); // Should parse first array element
      expect(result.map((t) => t.name)).toContain("engineering");
      expect(result.map((t) => t.name)).toContain("production");
    });

    it("should handle undefined header values", async () => {
      const { extractAndValidateTags } = await import("../server.js");

      const result = await extractAndValidateTags(
        { "x-tags": undefined },
        1,
        mockPrisma,
        mockRedis as RedisClientType,
      );

      expect(result).toEqual([]);
    });
  });
});
