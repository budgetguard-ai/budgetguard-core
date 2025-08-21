import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "redis";
import { PrismaClient } from "@prisma/client";
import {
  readSessionTagDataOptimized,
  SessionTagBatchData,
} from "../cache-utils";

// Mock Redis client
const mockRedis = {
  mGet: vi.fn(),
  setEx: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
};

// Mock Prisma client
const mockPrisma = {
  session: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  tenant: {
    findUnique: vi.fn(),
  },
  tag: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
} as unknown as PrismaClient;

describe("Ultra-Optimized Batch Cache Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("readSessionTagDataOptimized", () => {
    it("should perform single mGet call for all cache keys", async () => {
      const mockCacheValues = [
        JSON.stringify({
          sessionId: "test-session",
          tenantId: 1,
          effectiveBudgetUsd: 100,
          currentCostUsd: 25.5,
          status: "active",
        }),
        "25.5", // session cost
        JSON.stringify({
          id: 1,
          name: "test-tenant",
          defaultSessionBudgetUsd: 50,
          rateLimitPerMin: 100,
        }),
        "100", // rate limit
        "50", // tenant session budget
        JSON.stringify([
          {
            id: 1,
            name: "tag1",
            tenantId: 1,
            level: 1,
            isActive: true,
          },
        ]),
        "25", // tag session budget
      ];

      mockRedis.mGet.mockResolvedValue(mockCacheValues);

      const result = await readSessionTagDataOptimized(
        {
          sessionId: "test-session",
          tenantId: 1,
          tenantName: "test-tenant",
          tagIds: [1],
        },
        mockPrisma,
        mockRedis as any,
      );

      // Verify single mGet call was made
      expect(mockRedis.mGet).toHaveBeenCalledTimes(1);
      expect(mockRedis.mGet).toHaveBeenCalledWith([
        "session:test-session",
        "session_cost:test-session",
        "tenant:test-tenant",
        "ratelimit:test-tenant",
        "tenant_session_budget:1",
        "tags:tenant:1",
        "tag_session_budget:1",
      ]);

      // Verify all data was parsed correctly
      expect(result.sessionData).toEqual({
        sessionId: "test-session",
        tenantId: 1,
        effectiveBudgetUsd: 100,
        currentCostUsd: 25.5,
        status: "active",
      });
      expect(result.sessionCost).toBe(25.5);
      expect(result.tenantData).toBeDefined();
      expect(result.rateLimit).toBe(100);
      expect(result.tenantSessionBudget).toBe(50);
      expect(result.tags).toHaveLength(1);
      expect(result.tagSessionBudgets).toEqual({ 1: 25 });
    });

    it("should handle cache misses and fetch from database", async () => {
      // Simulate cache miss
      mockRedis.mGet.mockResolvedValue([null, null, null]);

      const mockSession = {
        sessionId: "test-session",
        tenantId: 1,
        effectiveBudgetUsd: { toNumber: () => 100 },
        currentCostUsd: { toNumber: () => 25.5 },
        status: "active",
        name: null,
        path: null,
      };

      const mockTenant = {
        id: 1,
        name: "test-tenant",
        defaultSessionBudgetUsd: { toNumber: () => 50 },
        rateLimitPerMin: 100,
      };

      // Set up all required mocks
      mockPrisma.session.findUnique.mockResolvedValue(mockSession);
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrisma.tag.findMany.mockResolvedValue([]);

      const result = await readSessionTagDataOptimized(
        {
          sessionId: "test-session",
          tenantId: 1,
        },
        mockPrisma,
        mockRedis as any,
      );

      // Verify database was queried
      expect(mockPrisma.session.findUnique).toHaveBeenCalledWith({
        where: { sessionId: "test-session" },
      });

      // Verify results include database data
      expect(result.sessionData).toBeDefined();
      expect(result.sessionData!.sessionId).toBe("test-session");
    });

    it("should handle Redis mGet failure gracefully", async () => {
      mockRedis.mGet.mockRejectedValue(new Error("Redis connection failed"));

      const mockSession = {
        sessionId: "test-session",
        tenantId: 1,
        effectiveBudgetUsd: { toNumber: () => 100 },
        currentCostUsd: { toNumber: () => 25.5 },
        status: "active",
        name: null,
        path: null,
      };

      mockPrisma.session.findUnique.mockResolvedValue(mockSession);

      const result = await readSessionTagDataOptimized(
        {
          sessionId: "test-session",
        },
        mockPrisma,
        mockRedis as any,
      );

      // Should fallback to database queries
      expect(mockPrisma.session.findUnique).toHaveBeenCalled();
      expect(result.sessionData).toBeDefined();
    });

    it("should handle partial cache hits correctly", async () => {
      // Mix of cache hits and misses
      const mockCacheValues = [
        JSON.stringify({
          sessionId: "test-session",
          tenantId: 1,
          effectiveBudgetUsd: 100,
          currentCostUsd: 25.5,
          status: "active",
        }),
        null, // session cost miss
        null, // tenant miss
      ];

      mockRedis.mGet.mockResolvedValue(mockCacheValues);

      const mockTenant = {
        id: 1,
        name: "test-tenant",
        defaultSessionBudgetUsd: { toNumber: () => 50 },
        rateLimitPerMin: 100,
      };

      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);

      const result = await readSessionTagDataOptimized(
        {
          sessionId: "test-session",
          tenantId: 1,
        },
        mockPrisma,
        mockRedis as any,
      );

      // Should have session data from cache
      expect(result.sessionData).toBeDefined();
      expect(result.sessionData!.sessionId).toBe("test-session");

      // Should have tenant data from database
      expect(mockPrisma.tenant.findUnique).toHaveBeenCalled();
    });

    it("should handle database query failures gracefully", async () => {
      mockRedis.mGet.mockResolvedValue([null]);
      mockPrisma.session.findUnique.mockRejectedValue(
        new Error("Database connection failed"),
      );

      const result = await readSessionTagDataOptimized(
        {
          sessionId: "test-session",
        },
        mockPrisma,
        mockRedis as any,
      );

      // Should return partial results even with database failures
      expect(result).toBeDefined();
      expect(result.sessionData).toBeUndefined();
    });

    it("should optimize tag usage cache keys", async () => {
      const mockCacheValues = [
        "15.5", // tag usage for tag 1, period monthly
        "25.2", // tag usage for tag 2, period monthly
      ];

      mockRedis.mGet.mockResolvedValue(mockCacheValues);

      const result = await readSessionTagDataOptimized(
        {
          tenantName: "test-tenant",
          tagIds: [1, 2],
          tagUsagePeriods: ["monthly"],
        },
        mockPrisma,
        mockRedis as any,
      );

      // Should include tag usage keys in batch request
      expect(mockRedis.mGet).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringMatching(/tag_usage:test-tenant:1:monthly/),
          expect.stringMatching(/tag_usage:test-tenant:2:monthly/),
        ]),
      );

      expect(result.tagUsages).toBeDefined();
    });

    it("should batch budget cache keys", async () => {
      // Mock empty cache response
      mockRedis.mGet.mockResolvedValue([null, null]);

      const result = await readSessionTagDataOptimized(
        {
          tenantName: "test-tenant",
          budgetPeriods: ["monthly", "daily"],
        },
        mockPrisma,
        mockRedis as any,
      );

      expect(mockRedis.mGet).toHaveBeenCalledWith(
        expect.arrayContaining([
          "budget:test-tenant:monthly",
          "budget:test-tenant:daily",
        ]),
      );
    });
  });

  describe("Performance Optimization", () => {
    it("should reduce Redis round trips from multiple to single call", async () => {
      const mockCacheValues = new Array(10).fill(null); // Simulate 10 cache keys
      mockRedis.mGet.mockResolvedValue(mockCacheValues);

      await readSessionTagDataOptimized(
        {
          sessionId: "test-session",
          tenantId: 1,
          tenantName: "test-tenant",
          tagIds: [1, 2, 3],
          tagUsagePeriods: ["monthly", "daily"],
          budgetPeriods: ["monthly", "daily"],
        },
        mockPrisma,
        mockRedis as any,
      );

      // Should make exactly ONE Redis call regardless of data complexity
      expect(mockRedis.mGet).toHaveBeenCalledTimes(1);

      // Should NOT make individual get calls
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it("should handle large batch sizes efficiently", async () => {
      const tagIds = Array.from({ length: 50 }, (_, i) => i + 1); // 50 tags
      const periods = ["monthly", "daily", "weekly"]; // 3 periods
      const mockCacheValues = new Array(200).fill(null); // Large response

      mockRedis.mGet.mockResolvedValue(mockCacheValues);

      const startTime = Date.now();
      await readSessionTagDataOptimized(
        {
          tenantName: "test-tenant",
          tagIds,
          tagUsagePeriods: periods,
          budgetPeriods: periods,
        },
        mockPrisma,
        mockRedis as any,
      );
      const duration = Date.now() - startTime;

      // Should complete quickly even with large batches
      expect(duration).toBeLessThan(100);
      expect(mockRedis.mGet).toHaveBeenCalledTimes(1);
    });
  });

  describe("Fallback Behavior", () => {
    it("should work without Redis client", async () => {
      const mockSession = {
        sessionId: "test-session",
        tenantId: 1,
        effectiveBudgetUsd: { toNumber: () => 100 },
        currentCostUsd: { toNumber: () => 25.5 },
        status: "active",
        name: null,
        path: null,
      };

      mockPrisma.session.findUnique.mockResolvedValue(mockSession);

      const result = await readSessionTagDataOptimized(
        {
          sessionId: "test-session",
        },
        mockPrisma,
        undefined, // No Redis
      );

      expect(result.sessionData).toBeDefined();
      expect(result.sessionData!.sessionId).toBe("test-session");
    });

    it("should handle timeout errors in database fallback", async () => {
      mockRedis.mGet.mockRejectedValue(new Error("Redis timeout"));

      // Simulate slow database query that will timeout
      mockPrisma.session.findUnique.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(null), 12000); // 12 second delay (exceeds timeout)
          }),
      );

      const result = await readSessionTagDataOptimized(
        {
          sessionId: "test-session",
        },
        mockPrisma,
        mockRedis as any,
      );

      // Should handle timeout gracefully and return partial results
      expect(result).toBeDefined();
    }, 15000); // Extend test timeout to 15 seconds
  });
});
