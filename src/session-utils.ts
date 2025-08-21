import { PrismaClient, Prisma } from "@prisma/client";
import { createClient } from "redis";

// Cache TTLs
const SESSION_CACHE_TTL = 10 * 60; // 10 minutes
const SESSION_COST_CACHE_TTL = 30 * 60; // 30 minutes
const TENANT_SESSION_BUDGET_TTL = 1 * 60 * 60; // 1 hour
const TAG_SESSION_BUDGET_TTL = 30 * 60; // 30 minutes

export interface SessionHeaders {
  sessionId?: string;
  sessionName?: string;
  sessionPath?: string;
}

export interface CachedSessionData {
  sessionId: string;
  tenantId: number;
  effectiveBudgetUsd: number | null;
  currentCostUsd: number;
  status: string;
  name?: string;
  path?: string;
}

// Cache key generators
export function getSessionCacheKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export function getSessionCostCacheKey(sessionId: string): string {
  return `session_cost:${sessionId}`;
}

export function getTenantSessionBudgetCacheKey(tenantId: number): string {
  return `tenant_session_budget:${tenantId}`;
}

export function getTagSessionBudgetCacheKey(tagId: number): string {
  return `tag_session_budget:${tagId}`;
}

export function extractSessionHeaders(
  h: Record<string, unknown>,
): SessionHeaders {
  // Case-insensitive header lookup
  const findHeader = (key: string): string | undefined => {
    for (const [headerKey, value] of Object.entries(h)) {
      if (headerKey.toLowerCase() === key.toLowerCase()) {
        return (value as string | undefined)?.trim();
      }
    }
    return undefined;
  };

  return {
    sessionId: findHeader("x-session-id"),
    sessionName: findHeader("x-session-name"),
    sessionPath: findHeader("x-session-path"),
  };
}

// Cache tenant session budget
export async function getCachedTenantSessionBudget(
  tenantId: number,
  redis?: ReturnType<typeof createClient>,
  prisma?: PrismaClient,
): Promise<number | null> {
  if (!redis) {
    // Fallback to database
    if (!prisma) return null;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultSessionBudgetUsd: true },
    });
    return tenant?.defaultSessionBudgetUsd?.toNumber() ?? null;
  }

  const cacheKey = getTenantSessionBudgetCacheKey(tenantId);

  try {
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === "null" ? null : parseFloat(cached);
    }
  } catch (error) {
    console.warn("Redis error fetching tenant session budget:", error);
  }

  // Cache miss - get from database
  if (!prisma) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { defaultSessionBudgetUsd: true },
  });

  const budget = tenant?.defaultSessionBudgetUsd?.toNumber() ?? null;

  try {
    await redis.setEx(
      cacheKey,
      TENANT_SESSION_BUDGET_TTL,
      budget === null ? "null" : budget.toString(),
    );
  } catch (error) {
    console.warn("Redis error caching tenant session budget:", error);
  }

  return budget;
}

// Cache tag session budget
export async function getCachedTagSessionBudget(
  tagIds: number[],
  redis?: ReturnType<typeof createClient>,
  prisma?: PrismaClient,
): Promise<number | null> {
  if (tagIds.length === 0) return null;

  if (!redis) {
    // Fallback to database
    if (!prisma) return null;
    const tagWithBudget = await prisma.tag.findFirst({
      where: {
        id: { in: tagIds },
        sessionBudgetUsd: { not: null },
      },
      orderBy: { sessionBudgetUsd: "asc" }, // choose lowest if multiple
      select: { sessionBudgetUsd: true },
    });
    return tagWithBudget?.sessionBudgetUsd?.toNumber() ?? null;
  }

  // Try to get from cache for each tag (batch get)
  const cacheKeys = tagIds.map((id) => getTagSessionBudgetCacheKey(id));

  try {
    const cachedValues = await redis.mGet(cacheKeys);
    for (let i = 0; i < cachedValues.length; i++) {
      const cached = cachedValues[i];
      if (cached !== null && cached !== "null") {
        return parseFloat(cached);
      }
    }
  } catch (error) {
    console.warn("Redis error fetching tag session budgets:", error);
  }

  // Cache miss - get from database
  if (!prisma) return null;

  const tagWithBudget = await prisma.tag.findFirst({
    where: {
      id: { in: tagIds },
      sessionBudgetUsd: { not: null },
    },
    orderBy: { sessionBudgetUsd: "asc" }, // choose lowest if multiple
    select: { id: true, sessionBudgetUsd: true },
  });

  const budget = tagWithBudget?.sessionBudgetUsd?.toNumber() ?? null;

  // Cache the result for the tag that had the budget (or null for all if no budget found)
  try {
    if (tagWithBudget) {
      const cacheKey = getTagSessionBudgetCacheKey(tagWithBudget.id);
      await redis.setEx(
        cacheKey,
        TAG_SESSION_BUDGET_TTL,
        budget === null ? "null" : budget.toString(),
      );
    } else {
      // Cache null for all tags if no budget found
      for (const tagId of tagIds) {
        const cacheKey = getTagSessionBudgetCacheKey(tagId);
        await redis.setEx(cacheKey, TAG_SESSION_BUDGET_TTL, "null");
      }
    }
  } catch (error) {
    console.warn("Redis error caching tag session budgets:", error);
  }

  return budget;
}

export async function getOrCreateSession(
  headers: SessionHeaders,
  tenantId: number,
  tagIds: number[],
  prisma: PrismaClient,
  redis?: ReturnType<typeof createClient>,
): Promise<{
  sessionId: string;
  effectiveBudgetUsd: number | null;
  currentCostUsd: number;
  status: string;
} | null> {
  if (!headers.sessionId) {
    // No session requested
    return null;
  }

  // Check if session already exists in cache
  const sessionCacheKey = getSessionCacheKey(headers.sessionId);
  let cachedSession: CachedSessionData | null = null;

  if (redis) {
    try {
      const cached = await redis.get(sessionCacheKey);
      if (cached) {
        cachedSession = JSON.parse(cached) as CachedSessionData;
      }
    } catch (error) {
      console.warn("Redis error fetching session cache:", error);
    }
  }

  // Get cached budgets in parallel (tenant + tag overrides)
  const [tenantBudget, tagBudget] = await Promise.all([
    getCachedTenantSessionBudget(tenantId, redis, prisma),
    getCachedTagSessionBudget(tagIds, redis, prisma),
  ]);

  const effective = tagBudget ?? tenantBudget;

  // If we have cached session and it's up to date, use it
  if (cachedSession && cachedSession.tenantId === tenantId) {
    // Check if budget changed (need to update cache)
    if (effective !== cachedSession.effectiveBudgetUsd) {
      // Update database and cache
      await prisma.session.update({
        where: { sessionId: cachedSession.sessionId },
        data: {
          effectiveBudgetUsd:
            effective !== null ? new Prisma.Decimal(effective) : null,
        },
      });

      cachedSession.effectiveBudgetUsd = effective;

      // Update cache
      if (redis) {
        try {
          await redis.setEx(
            sessionCacheKey,
            SESSION_CACHE_TTL,
            JSON.stringify(cachedSession),
          );
        } catch (error) {
          console.warn("Redis error updating session cache:", error);
        }
      }
    }

    // Get current cost from Redis cache (more up-to-date than session cache)
    let currentCost = cachedSession.currentCostUsd;
    if (redis) {
      try {
        const costCacheKey = getSessionCostCacheKey(headers.sessionId);
        const cachedCost = await redis.get(costCacheKey);
        if (cachedCost !== null) {
          currentCost = parseFloat(cachedCost);
        }
      } catch (error) {
        console.warn("Redis error fetching session cost:", error);
      }
    }

    return {
      sessionId: cachedSession.sessionId,
      effectiveBudgetUsd: effective,
      currentCostUsd: currentCost,
      status: cachedSession.status,
    };
  }

  // Cache miss - get from database
  const existing = await prisma.session.findUnique({
    where: { sessionId: headers.sessionId },
  });

  if (existing) {
    // Recompute effective budget each fetch (in case admin/tag changed)
    if (
      effective !== null &&
      effective !== existing.effectiveBudgetUsd?.toNumber()
    ) {
      await prisma.session.update({
        where: { sessionId: existing.sessionId },
        data: {
          effectiveBudgetUsd:
            effective !== null ? new Prisma.Decimal(effective) : null,
        },
      });
    }

    const sessionData: CachedSessionData = {
      sessionId: existing.sessionId,
      tenantId: existing.tenantId,
      effectiveBudgetUsd: effective,
      currentCostUsd:
        typeof existing.currentCostUsd.toNumber === "function"
          ? existing.currentCostUsd.toNumber()
          : Number(existing.currentCostUsd),
      status: existing.status,
      name: existing.name || undefined,
      path: existing.path || undefined,
    };

    // Cache the session data
    if (redis) {
      try {
        const sessionCacheKey = getSessionCacheKey(headers.sessionId);
        await redis.setEx(
          sessionCacheKey,
          SESSION_CACHE_TTL,
          JSON.stringify(sessionData),
        );

        // Also cache the current cost separately for atomic increments
        const costCacheKey = getSessionCostCacheKey(headers.sessionId);
        await redis.setEx(
          costCacheKey,
          SESSION_COST_CACHE_TTL,
          sessionData.currentCostUsd.toString(),
        );
      } catch (error) {
        console.warn("Redis error caching session data:", error);
      }
    }

    return {
      sessionId: existing.sessionId,
      effectiveBudgetUsd: effective,
      currentCostUsd: sessionData.currentCostUsd,
      status: existing.status,
    };
  }

  const created = await prisma.session.create({
    data: {
      sessionId: headers.sessionId,
      tenantId,
      name: headers.sessionName,
      path: headers.sessionPath,
      effectiveBudgetUsd:
        effective !== null ? new Prisma.Decimal(effective) : null,
      currentCostUsd: new Prisma.Decimal(0),
    },
  });

  if (tagIds.length > 0) {
    // Connect tags (optional; can be deferred)
    await prisma.session.update({
      where: { sessionId: created.sessionId },
      data: {
        tags: {
          connect: tagIds.map((id) => ({ id })),
        },
      },
    });
  }

  const sessionData: CachedSessionData = {
    sessionId: created.sessionId,
    tenantId: created.tenantId,
    effectiveBudgetUsd: effective,
    currentCostUsd: 0,
    status: created.status,
    name: created.name || undefined,
    path: created.path || undefined,
  };

  // Cache the new session
  if (redis) {
    try {
      const sessionCacheKey = getSessionCacheKey(headers.sessionId);
      await redis.setEx(
        sessionCacheKey,
        SESSION_CACHE_TTL,
        JSON.stringify(sessionData),
      );

      // Also cache the initial cost
      const costCacheKey = getSessionCostCacheKey(headers.sessionId);
      await redis.setEx(costCacheKey, SESSION_COST_CACHE_TTL, "0");
    } catch (error) {
      console.warn("Redis error caching new session:", error);
    }
  }

  return {
    sessionId: created.sessionId,
    effectiveBudgetUsd: effective,
    currentCostUsd: 0,
    status: created.status,
  };
}

export async function markSessionBudgetExceeded(
  sessionId: string,
  prisma: PrismaClient,
  redis?: ReturnType<typeof createClient>,
) {
  if (!sessionId) return;

  // Update database
  await prisma.session.update({
    where: { sessionId },
    data: { status: "budget_exceeded" },
  });

  // Update cached session status
  if (redis) {
    try {
      const sessionCacheKey = getSessionCacheKey(sessionId);
      const cached = await redis.get(sessionCacheKey);
      if (cached) {
        const sessionData = JSON.parse(cached) as CachedSessionData;
        sessionData.status = "budget_exceeded";
        await redis.setEx(
          sessionCacheKey,
          SESSION_CACHE_TTL,
          JSON.stringify(sessionData),
        );
      }
    } catch (error) {
      console.warn("Redis error updating session status:", error);
    }
  }
}

// Redis-based atomic session cost increment
export async function incrementSessionCost(
  sessionId: string,
  usd: number,
  prisma: PrismaClient,
  redis?: ReturnType<typeof createClient>,
) {
  if (!sessionId || usd <= 0) return;

  // Use Redis for atomic increment if available
  if (redis) {
    try {
      const costCacheKey = getSessionCostCacheKey(sessionId);
      await redis.incrByFloat(costCacheKey, usd);

      // Extend TTL
      await redis.expire(costCacheKey, SESSION_COST_CACHE_TTL);

      // Update lastActiveAt in database (async, don't wait)
      prisma.session
        .update({
          where: { sessionId },
          data: { lastActiveAt: new Date() },
        })
        .catch((error) => {
          console.warn("Failed to update session lastActiveAt:", error);
        });

      return;
    } catch (error) {
      console.warn("Redis error incrementing session cost:", error);
      // Fall back to database
    }
  }

  // Fallback to database increment
  await prisma.session.update({
    where: { sessionId },
    data: {
      currentCostUsd: {
        increment: new Prisma.Decimal(usd),
      },
      lastActiveAt: new Date(),
    },
  });
}

// Get current session cost (Redis-first)
export async function getSessionCost(
  sessionId: string,
  redis?: ReturnType<typeof createClient>,
  prisma?: PrismaClient,
): Promise<number> {
  if (!sessionId) return 0;

  // Try Redis first
  if (redis) {
    try {
      const costCacheKey = getSessionCostCacheKey(sessionId);
      const cached = await redis.get(costCacheKey);
      if (cached !== null) {
        return parseFloat(cached);
      }
    } catch (error) {
      console.warn("Redis error fetching session cost:", error);
    }
  }

  // Fallback to database
  if (!prisma) return 0;

  const session = await prisma.session.findUnique({
    where: { sessionId },
    select: { currentCostUsd: true },
  });

  return session?.currentCostUsd.toNumber
    ? session.currentCostUsd.toNumber()
    : Number(session?.currentCostUsd || 0);
}
