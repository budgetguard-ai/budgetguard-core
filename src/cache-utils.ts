export interface CacheOptions {
  redis?: ReturnType<typeof import("redis").createClient>;
  ttl?: number; // seconds
}

export interface SessionTagBatchData {
  // Session data
  sessionData?: {
    sessionId: string;
    tenantId: number;
    effectiveBudgetUsd: number | null;
    currentCostUsd: number;
    status: string;
    name?: string;
    path?: string;
  };
  sessionCost?: number;

  // Tag data
  tags?: Array<{
    id: number;
    name: string;
    tenantId: number;
    level: number;
    isActive: boolean;
    path?: string;
    parentId?: number;
  }>;
  tagUsages?: Record<number, number>; // tagId -> usage

  // Budget data
  tenantSessionBudget?: number | null;
  tagSessionBudgets?: Record<number, number | null>; // tagId -> budget

  // Tenant data
  tenantData?: {
    id: number;
    name: string;
    defaultSessionBudgetUsd: number | null;
    rateLimitPerMin: number | null;
  };

  // Rate limit
  rateLimit?: number;
}

/**
 * Clear all cache entries for a specific tenant
 */
export async function clearTenantCache(
  tenant: string,
  redis?: ReturnType<typeof import("redis").createClient>,
): Promise<void> {
  if (!redis) return;

  const patterns = [
    `budget:${tenant}:*`,
    `ledger:${tenant}:*`,
    `ratelimit:${tenant}`,
  ];

  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  }
}

/**
 * Clear specific budget cache for a tenant
 */
export async function clearBudgetCache(
  tenant: string,
  period?: string,
  redis?: ReturnType<typeof import("redis").createClient>,
): Promise<void> {
  if (!redis) return;

  if (period) {
    await redis.del(`budget:${tenant}:${period}`);
  } else {
    const keys = await redis.keys(`budget:${tenant}:*`);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  }
}

/**
 * Set cache with automatic TTL
 */
export async function setCacheWithTTL(
  key: string,
  value: string,
  options: CacheOptions,
): Promise<void> {
  if (!options.redis) return;

  const ttl = options.ttl || 3600; // Default 1 hour
  await options.redis.setEx(key, ttl, value);
}

/**
 * Ultra-optimized batch operation for session/tag/tenant data following readBudgetsOptimized pattern
 * Single mGet call for all session, tag, tenant, and budget-related cache reads
 */
export async function readSessionTagDataOptimized(
  params: {
    sessionId?: string;
    tenantId?: number;
    tenantName?: string;
    tagIds?: number[];
    tagUsagePeriods?: string[];
    budgetPeriods?: string[];
  },
  prisma: import("@prisma/client").PrismaClient,
  redis?: ReturnType<typeof import("redis").createClient>,
): Promise<SessionTagBatchData> {
  if (!redis) {
    // Fallback to individual database queries (slower but functional)
    return await readSessionTagDataFallback(params, prisma);
  }

  // Step 1: Build all cache keys for single batch mGet operation
  const cacheKeys: string[] = [];
  const keyMap: Record<string, number> = {}; // key -> index in cacheKeys array

  let keyIndex = 0;

  // Session cache keys
  if (params.sessionId) {
    const sessionKey = `session:${params.sessionId}`;
    const sessionCostKey = `session_cost:${params.sessionId}`;
    cacheKeys.push(sessionKey, sessionCostKey);
    keyMap["session"] = keyIndex++;
    keyMap["sessionCost"] = keyIndex++;
  }

  // Tenant cache keys
  if (params.tenantName) {
    const tenantKey = `tenant:${params.tenantName}`;
    const rateLimitKey = `ratelimit:${params.tenantName}`;
    cacheKeys.push(tenantKey, rateLimitKey);
    keyMap["tenant"] = keyIndex++;
    keyMap["rateLimit"] = keyIndex++;
  }

  // Tenant session budget
  if (params.tenantId) {
    const tenantSessionBudgetKey = `tenant_session_budget:${params.tenantId}`;
    cacheKeys.push(tenantSessionBudgetKey);
    keyMap["tenantSessionBudget"] = keyIndex++;
  }

  // Tag cache keys
  if (params.tenantId) {
    const tagsKey = `tags:tenant:${params.tenantId}`;
    cacheKeys.push(tagsKey);
    keyMap["tags"] = keyIndex++;
  }

  // Tag session budgets
  if (params.tagIds?.length) {
    params.tagIds.forEach((tagId) => {
      const tagSessionBudgetKey = `tag_session_budget:${tagId}`;
      cacheKeys.push(tagSessionBudgetKey);
      keyMap[`tagSessionBudget_${tagId}`] = keyIndex++;
    });
  }

  // Tag usage cache keys
  if (
    params.tagIds?.length &&
    params.tagUsagePeriods?.length &&
    params.tenantName
  ) {
    params.tagIds.forEach((tagId) => {
      params.tagUsagePeriods?.forEach((period) => {
        const tagUsageKey = `tag_usage:${params.tenantName}:${tagId}:${period}:${new Date().toISOString().slice(0, 10)}`;
        cacheKeys.push(tagUsageKey);
        keyMap[`tagUsage_${tagId}_${period}`] = keyIndex++;
      });
    });
  }

  // Budget cache keys
  if (params.budgetPeriods?.length && params.tenantName) {
    params.budgetPeriods.forEach((period) => {
      const budgetKey = `budget:${params.tenantName}:${period}`;
      cacheKeys.push(budgetKey);
      keyMap[`budget_${period}`] = keyIndex++;
    });
  }

  // Step 2: Single batch mGet call for ALL data with error handling
  let cacheValues: (string | null)[] = [];
  try {
    cacheValues = cacheKeys.length > 0 ? await redis.mGet(cacheKeys) : [];
  } catch (error) {
    console.warn(
      "Redis batch mGet operation failed, falling back to database:",
      error,
    );
    // On Redis failure, fall back to database queries
    return await readSessionTagDataFallback(params, prisma);
  }

  // Step 3: Parse results and populate response object
  const result: SessionTagBatchData = {};
  const missingKeys: string[] = [];

  // Parse session data
  if (params.sessionId && keyMap["session"] !== undefined) {
    const sessionValue = cacheValues[keyMap["session"]];
    const sessionCostValue = cacheValues[keyMap["sessionCost"]];

    if (sessionValue) {
      try {
        result.sessionData = JSON.parse(sessionValue);
      } catch (e) {
        console.warn("Failed to parse cached session data:", e);
        missingKeys.push("session");
      }
    } else {
      missingKeys.push("session");
    }

    if (sessionCostValue) {
      result.sessionCost = parseFloat(sessionCostValue);
    }
  }

  // Parse tenant data
  if (
    params.tenantName &&
    keyMap["tenant"] !== undefined &&
    keyMap["rateLimit"] !== undefined
  ) {
    const tenantValue = cacheValues[keyMap["tenant"]] || null;
    const rateLimitValue = cacheValues[keyMap["rateLimit"]] || null;

    if (tenantValue) {
      try {
        result.tenantData = JSON.parse(tenantValue);
      } catch (e) {
        console.warn("Failed to parse cached tenant data:", e);
        missingKeys.push("tenant");
      }
    } else {
      missingKeys.push("tenant");
    }

    if (rateLimitValue) {
      result.rateLimit = parseInt(rateLimitValue, 10);
    }
  } else if (params.tenantName) {
    // Keys not found in map, mark as missing
    missingKeys.push("tenant");
  }

  // Parse tenant session budget
  if (params.tenantId && keyMap["tenantSessionBudget"] !== undefined) {
    const budgetValue = cacheValues[keyMap["tenantSessionBudget"]];
    if (budgetValue !== null) {
      result.tenantSessionBudget =
        budgetValue === "null" ? null : parseFloat(budgetValue);
    } else {
      missingKeys.push("tenantSessionBudget");
    }
  }

  // Parse tags
  if (params.tenantId && keyMap["tags"] !== undefined) {
    const tagsValue = cacheValues[keyMap["tags"]];
    if (tagsValue) {
      try {
        result.tags = JSON.parse(tagsValue);
      } catch (e) {
        console.warn("Failed to parse cached tags data:", e);
        missingKeys.push("tags");
      }
    } else {
      missingKeys.push("tags");
    }
  }

  // Parse tag session budgets
  if (params.tagIds?.length) {
    result.tagSessionBudgets = {};
    params.tagIds.forEach((tagId) => {
      const key = `tagSessionBudget_${tagId}`;
      if (keyMap[key] !== undefined) {
        const budgetValue = cacheValues[keyMap[key]];
        if (budgetValue !== null) {
          result.tagSessionBudgets![tagId] =
            budgetValue === "null" ? null : parseFloat(budgetValue);
        }
      }
    });
  }

  // Parse tag usages
  if (params.tagIds?.length && params.tagUsagePeriods?.length) {
    result.tagUsages = {};
    params.tagIds.forEach((tagId) => {
      params.tagUsagePeriods?.forEach((period) => {
        const key = `tagUsage_${tagId}_${period}`;
        if (keyMap[key] !== undefined) {
          const usageValue = cacheValues[keyMap[key]];
          if (usageValue) {
            result.tagUsages![tagId] = parseFloat(usageValue);
          }
        }
      });
    });
  }

  // Step 4: Fetch missing data from database in single query batch
  if (missingKeys.length > 0) {
    try {
      const dbResults = await fetchMissingDataFromDB(
        params,
        missingKeys,
        prisma,
      );

      // Merge database results
      Object.assign(result, dbResults);

      // Cache the fetched data for future requests (with error handling)
      try {
        await cacheFetchedData(params, dbResults, redis);
      } catch (cacheError) {
        console.warn("Failed to cache fetched database results:", cacheError);
        // Continue execution even if caching fails
      }
    } catch (dbError) {
      console.error(
        "Critical error fetching missing data from database:",
        dbError,
      );
      // Log the error but don't throw - return partial results
      console.warn(
        `Returning partial results. Missing keys: ${missingKeys.join(", ")}`,
      );
    }
  }

  return result;
}

/**
 * Fallback for when Redis is not available - uses direct database queries
 */
async function readSessionTagDataFallback(
  params: {
    sessionId?: string;
    tenantId?: number;
    tenantName?: string;
    tagIds?: number[];
    tagUsagePeriods?: string[];
    budgetPeriods?: string[];
  },
  prisma: import("@prisma/client").PrismaClient,
): Promise<SessionTagBatchData> {
  const result: SessionTagBatchData = {};

  // Parallel database queries for better performance with error handling
  const promises: Promise<void>[] = [];

  // Add timeout protection for database queries
  const QUERY_TIMEOUT = 10000; // 10 seconds

  if (params.sessionId) {
    promises.push(
      prisma.session
        .findUnique({
          where: { sessionId: params.sessionId },
        })
        .then((session) => {
          if (session) {
            result.sessionData = {
              sessionId: session.sessionId,
              tenantId: session.tenantId,
              effectiveBudgetUsd:
                session.effectiveBudgetUsd?.toNumber() ?? null,
              currentCostUsd: session.currentCostUsd.toNumber(),
              status: session.status,
              name: session.name || undefined,
              path: session.path || undefined,
            };
            result.sessionCost = session.currentCostUsd.toNumber();
          }
        }),
    );
  }

  if (params.tenantId || params.tenantName) {
    const whereClause = params.tenantId
      ? { id: params.tenantId }
      : { name: params.tenantName };

    promises.push(
      prisma.tenant
        .findUnique({
          where: whereClause,
        })
        .then((tenant) => {
          if (tenant) {
            result.tenantData = {
              id: tenant.id,
              name: tenant.name,
              defaultSessionBudgetUsd:
                tenant.defaultSessionBudgetUsd?.toNumber() ?? null,
              rateLimitPerMin: tenant.rateLimitPerMin,
            };
            result.tenantSessionBudget =
              tenant.defaultSessionBudgetUsd?.toNumber() ?? null;
            result.rateLimit = tenant.rateLimitPerMin ?? 100;
          }
        }),
    );
  }

  if (params.tenantId) {
    promises.push(
      prisma.tag
        .findMany({
          where: {
            tenantId: params.tenantId,
            isActive: true,
          },
        })
        .then((tags) => {
          result.tags = tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            tenantId: tag.tenantId,
            level: tag.level,
            isActive: tag.isActive,
            path: tag.path || undefined,
            parentId: tag.parentId || undefined,
          }));
        }),
    );
  }

  if (params.tagIds?.length) {
    promises.push(
      prisma.tag
        .findMany({
          where: {
            id: { in: params.tagIds },
            sessionBudgetUsd: { not: null },
          },
        })
        .then((tags) => {
          result.tagSessionBudgets = {};
          tags.forEach((tag) => {
            result.tagSessionBudgets![tag.id] =
              tag.sessionBudgetUsd?.toNumber() ?? null;
          });
        }),
    );
  }

  // Execute all queries with timeout protection and individual error handling
  await Promise.allSettled(
    promises.map((promise) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Database query timeout")),
            QUERY_TIMEOUT,
          ),
        ),
      ]),
    ),
  )
    .then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn(
            `Database fallback query ${index} failed:`,
            result.reason,
          );
        }
      });
    })
    .catch((error) => {
      console.error("Critical error in database fallback:", error);
    });

  return result;
}

/**
 * Fetch missing data from database with optimized queries
 */
async function fetchMissingDataFromDB(
  params: {
    sessionId?: string;
    tenantId?: number;
    tenantName?: string;
    tagIds?: number[];
  },
  missingKeys: string[],
  prisma: import("@prisma/client").PrismaClient,
): Promise<Partial<SessionTagBatchData>> {
  const result: Partial<SessionTagBatchData> = {};
  const promises: Promise<void>[] = [];

  if (missingKeys.includes("session") && params.sessionId) {
    promises.push(
      prisma.session
        .findUnique({
          where: { sessionId: params.sessionId },
        })
        .then((session) => {
          if (session) {
            result.sessionData = {
              sessionId: session.sessionId,
              tenantId: session.tenantId,
              effectiveBudgetUsd:
                session.effectiveBudgetUsd?.toNumber() ?? null,
              currentCostUsd: session.currentCostUsd.toNumber(),
              status: session.status,
              name: session.name || undefined,
              path: session.path || undefined,
            };
          }
        }),
    );
  }

  if (
    missingKeys.includes("tenant") &&
    (params.tenantId || params.tenantName)
  ) {
    const whereClause = params.tenantId
      ? { id: params.tenantId }
      : { name: params.tenantName };

    promises.push(
      prisma.tenant
        .findUnique({
          where: whereClause,
        })
        .then((tenant) => {
          if (tenant) {
            result.tenantData = {
              id: tenant.id,
              name: tenant.name,
              defaultSessionBudgetUsd:
                tenant.defaultSessionBudgetUsd?.toNumber() ?? null,
              rateLimitPerMin: tenant.rateLimitPerMin,
            };
            result.rateLimit = tenant.rateLimitPerMin ?? 100;
          }
        }),
    );
  }

  if (missingKeys.includes("tenantSessionBudget") && params.tenantId) {
    promises.push(
      prisma.tenant
        .findUnique({
          where: { id: params.tenantId },
          select: { defaultSessionBudgetUsd: true },
        })
        .then((tenant) => {
          result.tenantSessionBudget =
            tenant?.defaultSessionBudgetUsd?.toNumber() ?? null;
        })
        .catch((error) => {
          console.warn("Failed to fetch tenant session budget:", error);
        }),
    );
  }

  if (missingKeys.includes("tags") && params.tenantId) {
    promises.push(
      prisma.tag
        .findMany({
          where: {
            tenantId: params.tenantId,
            isActive: true,
          },
        })
        .then((tags) => {
          result.tags = tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            tenantId: tag.tenantId,
            level: tag.level,
            isActive: tag.isActive,
            path: tag.path || undefined,
            parentId: tag.parentId || undefined,
          }));
        })
        .catch((error) => {
          console.warn("Failed to fetch tags:", error);
        }),
    );
  }

  // Execute queries with error handling and timeouts
  const QUERY_TIMEOUT = 5000; // 5 seconds for individual queries
  await Promise.allSettled(
    promises.map((promise) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Database query timeout")),
            QUERY_TIMEOUT,
          ),
        ),
      ]),
    ),
  ).then((results) => {
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.warn(
          `Missing data database query ${index} failed:`,
          result.reason,
        );
      }
    });
  });

  return result;
}

/**
 * Cache fetched database results for future use
 */
async function cacheFetchedData(
  params: {
    sessionId?: string;
    tenantId?: number;
    tenantName?: string;
    tagIds?: number[];
  },
  data: Partial<SessionTagBatchData>,
  redis: ReturnType<typeof import("redis").createClient>,
): Promise<void> {
  const cachePromises: Promise<unknown>[] = [];

  // Cache session data
  if (data.sessionData && params.sessionId) {
    cachePromises.push(
      redis.setEx(
        `session:${params.sessionId}`,
        10 * 60, // 10 minutes
        JSON.stringify(data.sessionData),
      ),
    );
  }

  // Cache tenant data
  if (data.tenantData && params.tenantName) {
    cachePromises.push(
      redis.setEx(
        `tenant:${params.tenantName}`,
        60 * 60, // 1 hour
        JSON.stringify(data.tenantData),
      ),
    );
  }

  if (data.rateLimit !== undefined && params.tenantName) {
    cachePromises.push(
      redis.setEx(
        `ratelimit:${params.tenantName}`,
        60 * 60, // 1 hour
        data.rateLimit.toString(),
      ),
    );
  }

  // Cache tenant session budget
  if (data.tenantSessionBudget !== undefined && params.tenantId) {
    cachePromises.push(
      redis.setEx(
        `tenant_session_budget:${params.tenantId}`,
        60 * 60, // 1 hour
        data.tenantSessionBudget === null
          ? "null"
          : data.tenantSessionBudget.toString(),
      ),
    );
  }

  // Cache tags
  if (data.tags && params.tenantId) {
    cachePromises.push(
      redis.setEx(
        `tags:tenant:${params.tenantId}`,
        5 * 60, // 5 minutes
        JSON.stringify(data.tags),
      ),
    );
  }

  await Promise.all(cachePromises).catch((error) => {
    console.warn("Redis error caching fetched data:", error);
  });
}
