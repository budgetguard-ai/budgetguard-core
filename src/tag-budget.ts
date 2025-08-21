import { PrismaClient } from "@prisma/client";
import { readBudget } from "./budget.js";
import { getCachedTagUsage } from "./tag-cache.js";
import { createClient } from "redis";
import { createTagUsageTracker } from "./tag-usage-tracking.js";

// Cache TTL for tag budget configuration
const TAG_BUDGET_CONFIG_TTL = 30 * 60; // 30 minutes, same as tag session budget TTL

// Double-counting issue resolved by removing redundant server.ts recording
// Tag usage now handled exclusively by worker processing bg_events stream

// Optimized tag usage retrieval using Redis-based tracking
export async function getOptimizedTagUsage(
  tenantId: number,
  tagId: number,
  period: string,
  startDate: Date,
  endDate: Date,
  redis?: ReturnType<typeof createClient>,
  prisma?: PrismaClient,
): Promise<number> {
  if (!redis || !prisma) {
    if (!prisma) {
      throw new Error(
        "Prisma client is required for getTagUsageFromDatabase fallback.",
      );
    }
    // Fallback to database
    return await getTagUsageFromDatabase(
      tenantId,
      tagId,
      startDate,
      endDate,
      prisma,
    );
  }

  try {
    // Use the new Redis-based tracker for optimized queries
    const tracker = createTagUsageTracker(redis, prisma);

    if (period === "daily" || period === "monthly") {
      // Use batch query for better performance
      const usageData = await tracker.batchQueryTagUsage(
        tenantId,
        [tagId],
        period as "daily" | "monthly",
        startDate,
      );

      if (usageData[tagId] > 0) {
        return usageData[tagId];
      }

      // Fallback to range query if batch query returns 0
      const results = await tracker.queryTagUsage({
        tenantId,
        tenant: "", // Not used in this context
        tagIds: [tagId],
        startDate,
        endDate,
        period: period as "daily" | "monthly",
      });

      return results.length > 0 ? results[0].totalUsage : 0;
    } else {
      // For custom periods, use the general query
      const results = await tracker.queryTagUsage({
        tenantId,
        tenant: "", // Not used in this context
        tagIds: [tagId],
        startDate,
        endDate,
        period: "custom",
      });

      return results.length > 0 ? results[0].totalUsage : 0;
    }
  } catch (error) {
    console.warn(`Error in optimized tag usage query for tag ${tagId}:`, error);
    // Fallback to original method
    return (
      (await getCachedTagUsage(
        "", // tenant name not used in fallback
        tagId,
        period,
        redis,
      )) ??
      (await getTagUsageFromDatabase(
        tenantId,
        tagId,
        startDate,
        endDate,
        prisma,
      ))
    );
  }
}

export interface CachedTagBudget {
  id: number;
  tagId: number;
  period: string;
  amountUsd: string; // stored as string to preserve decimal precision
  weight: number;
  inheritanceMode: string;
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
  tag: {
    id: number;
    name: string;
  };
}

// Generate cache key for tag budget configuration
export function getTagBudgetCacheKey(tagId: number): string {
  return `tag_session_budget:${tagId}`;
}

// Get cached tag budget configuration with database fallback
export async function getCachedTagBudgets(
  tagId: number,
  redis?: ReturnType<typeof createClient>,
  prisma?: PrismaClient,
): Promise<CachedTagBudget[]> {
  if (!redis) {
    // Fallback to database
    if (!prisma) return [];
    return await getTagBudgetsFromDatabase(tagId, prisma);
  }

  const cacheKey = getTagBudgetCacheKey(tagId);

  try {
    const cached = await redis.get(cacheKey);
    if (cached !== null && cached !== "null") {
      const parsed = JSON.parse(cached) as CachedTagBudget[];
      // Additional safety check: ensure parsed result is an array
      if (Array.isArray(parsed)) {
        return parsed;
      } else {
        console.warn(
          `Invalid cached data for tag ${tagId}, falling back to database:`,
          parsed,
        );
      }
    }
  } catch (error) {
    console.warn("Redis error fetching tag budget config:", error);
  }

  // Cache miss - get from database
  if (!prisma) return [];

  const tagBudgets = await getTagBudgetsFromDatabase(tagId, prisma);

  // Cache the result
  try {
    await redis.setEx(
      cacheKey,
      TAG_BUDGET_CONFIG_TTL,
      JSON.stringify(tagBudgets),
    );
  } catch (error) {
    console.warn("Redis error caching tag budget config:", error);
  }

  return tagBudgets;
}

// Helper function to get tag budgets from database
async function getTagBudgetsFromDatabase(
  tagId: number,
  prisma: PrismaClient,
): Promise<CachedTagBudget[]> {
  const tagBudgets = await prisma.tagBudget.findMany({
    where: {
      tagId,
      isActive: true,
    },
    include: {
      tag: true,
    },
  });

  return tagBudgets.map((budget) => ({
    id: budget.id,
    tagId: budget.tagId,
    period: budget.period,
    amountUsd: budget.amountUsd.toString(),
    weight: budget.weight,
    inheritanceMode: budget.inheritanceMode,
    startDate: budget.startDate || undefined,
    endDate: budget.endDate || undefined,
    isActive: budget.isActive,
    tag: {
      id: budget.tag.id,
      name: budget.tag.name,
    },
  }));
}

// Invalidate tag budget cache when budgets are modified
export async function invalidateTagBudgetCache(
  tagId: number,
  redis?: ReturnType<typeof createClient>,
): Promise<void> {
  if (!redis) return;

  try {
    const cacheKey = getTagBudgetCacheKey(tagId);
    await redis.del(cacheKey);
  } catch (error) {
    console.warn("Redis error invalidating tag budget cache:", error);
  }
}

export interface TagBudgetCheck {
  tagId: number;
  tagName: string;
  budgetId: number;
  period: string;
  amount: number;
  usage: number;
  weight: number;
  inheritanceMode: string;
  exceeded: boolean;
}

export interface TagBudgetOptions {
  validatedTags: Array<{ id: number; name: string; weight: number }>;
  tenant: string;
  tenantId: number;
  prisma: PrismaClient;
  redis?: ReturnType<typeof import("redis").createClient>;
  ledgerKey: (
    period: "custom" | "monthly" | "daily",
    date?: Date,
    window?: { startDate: Date; endDate: Date },
  ) => string;
}

// Check tag budgets for all validated tags
export async function checkTagBudgets({
  validatedTags,
  tenant,
  tenantId,
  prisma,
  redis,
  ledgerKey,
}: TagBudgetOptions): Promise<TagBudgetCheck[]> {
  const tagBudgetChecks: TagBudgetCheck[] = [];

  for (const validatedTag of validatedTags) {
    // Get all active budgets for this tag using cache
    const cachedTagBudgets = await getCachedTagBudgets(
      validatedTag.id,
      redis,
      prisma,
    );

    // Safety check: ensure cachedTagBudgets is an array
    if (!cachedTagBudgets || !Array.isArray(cachedTagBudgets)) {
      console.warn(
        `getCachedTagBudgets returned invalid data for tag ${validatedTag.name}:`,
        cachedTagBudgets,
      );
      continue; // Skip this tag
    }

    for (const tagBudget of cachedTagBudgets) {
      // Calculate usage for this tag and period
      let usage = 0;

      try {
        // For recurring periods (daily, monthly)
        if (tagBudget.period === "daily" || tagBudget.period === "monthly") {
          const budgetData = await readBudget({
            tenant,
            period: tagBudget.period,
            prisma,
            redis,
            defaultBudget: 0, // Use 0 as default for tag budgets
          });

          // Generate ledger key (currently unused but may be needed for future cache key logic)
          ledgerKey(tagBudget.period as "daily" | "monthly", new Date(), {
            startDate: budgetData.startDate,
            endDate: budgetData.endDate,
          });

          // Use optimized Redis-based usage tracking
          usage = await getOptimizedTagUsage(
            tenantId,
            validatedTag.id,
            tagBudget.period,
            budgetData.startDate,
            budgetData.endDate,
            redis,
            prisma,
          );
        } else if (
          tagBudget.period === "custom" &&
          tagBudget.startDate &&
          tagBudget.endDate
        ) {
          // For custom periods, use optimized tracking
          usage = await getOptimizedTagUsage(
            tenantId,
            validatedTag.id,
            tagBudget.period,
            tagBudget.startDate,
            tagBudget.endDate,
            redis,
            prisma,
          );
        }

        // Apply weight to usage
        const weightedUsage = usage * tagBudget.weight * validatedTag.weight;
        const budgetAmount = parseFloat(tagBudget.amountUsd);

        // Debug logging for budget comparison
        console.log(
          `Tag ${validatedTag.name}: rawUsage=${usage}, tagWeight=${tagBudget.weight}, validatedWeight=${validatedTag.weight}, weightedUsage=${weightedUsage}, budget=${budgetAmount}, exceeded=${weightedUsage >= budgetAmount}`,
        );

        tagBudgetChecks.push({
          tagId: validatedTag.id,
          tagName: validatedTag.name,
          budgetId: tagBudget.id,
          period: tagBudget.period,
          amount: budgetAmount,
          usage: weightedUsage,
          weight: tagBudget.weight * validatedTag.weight,
          inheritanceMode: tagBudget.inheritanceMode,
          exceeded: weightedUsage >= budgetAmount,
        });
      } catch (error) {
        console.error(
          `Error checking budget for tag ${validatedTag.name}:`,
          error,
        );
        // In case of error, assume budget exceeded for safety
        tagBudgetChecks.push({
          tagId: validatedTag.id,
          tagName: validatedTag.name,
          budgetId: tagBudget.id,
          period: tagBudget.period,
          amount: parseFloat(tagBudget.amountUsd),
          usage: 0,
          weight: tagBudget.weight * validatedTag.weight,
          inheritanceMode: tagBudget.inheritanceMode,
          exceeded: true,
        });
      }
    }
  }

  return tagBudgetChecks;
}

// Helper function to get tag usage from database
async function getTagUsageFromDatabase(
  tenantId: number,
  tagId: number,
  startDate: Date,
  endDate: Date,
  prisma: PrismaClient,
): Promise<number> {
  const result = await prisma.requestTag.findMany({
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

  // Sum up the weighted usage
  let totalUsage = 0;
  for (const requestTag of result) {
    const baseUsage = parseFloat(requestTag.usage.usd.toString());
    const weightedUsage = baseUsage * requestTag.weight;
    totalUsage += weightedUsage;
  }

  return totalUsage;
}

// Check hierarchical tag budgets
export async function checkHierarchicalTagBudgets({
  validatedTags,
  tenant,
  tenantId,
  prisma,
  redis,
}: TagBudgetOptions): Promise<TagBudgetCheck[]> {
  const hierarchicalChecks: TagBudgetCheck[] = [];

  for (const validatedTag of validatedTags) {
    // Get the tag with its hierarchy
    const tag = await prisma.tag.findUnique({
      where: { id: validatedTag.id },
      include: { parent: true },
    });

    if (!tag) continue;

    // Check parent budgets if inheritance mode requires it
    let currentTag = tag;
    while (currentTag.parent) {
      const parentTagBudgets = await getCachedTagBudgets(
        currentTag.parent.id,
        redis,
        prisma,
      );

      for (const parentBudget of parentTagBudgets) {
        if (
          parentBudget.inheritanceMode === "STRICT" ||
          parentBudget.inheritanceMode === "LENIENT"
        ) {
          // Add parent budget check with proper date handling
          let parentUsage = 0;

          if (
            parentBudget.period === "daily" ||
            parentBudget.period === "monthly"
          ) {
            // For recurring periods, use the budget data calculation
            const budgetData = await readBudget({
              tenant,
              period: parentBudget.period,
              prisma,
              redis, // Use Redis cache for better performance
              defaultBudget: 0,
            });

            parentUsage = await getOptimizedTagUsage(
              tenantId,
              currentTag.parent.id,
              parentBudget.period,
              budgetData.startDate,
              budgetData.endDate,
              redis,
              prisma,
            );
          } else if (
            parentBudget.period === "custom" &&
            parentBudget.startDate &&
            parentBudget.endDate
          ) {
            // For custom periods, use optimized tracking
            parentUsage = await getOptimizedTagUsage(
              tenantId,
              currentTag.parent.id,
              parentBudget.period,
              parentBudget.startDate,
              parentBudget.endDate,
              redis,
              prisma,
            );
          }

          const budgetAmount = parseFloat(parentBudget.amountUsd);
          const weightedUsage =
            parentUsage * parentBudget.weight * validatedTag.weight;

          hierarchicalChecks.push({
            tagId: currentTag.parent.id,
            tagName: currentTag.parent.name,
            budgetId: parentBudget.id,
            period: parentBudget.period,
            amount: budgetAmount,
            usage: weightedUsage,
            weight: parentBudget.weight * validatedTag.weight,
            inheritanceMode: parentBudget.inheritanceMode,
            exceeded: weightedUsage >= budgetAmount,
          });
        }
      }

      if (currentTag.parent) {
        // Fetch the parent tag with its parent included for next iteration
        const parentTag = await prisma.tag.findUnique({
          where: { id: currentTag.parent.id },
          include: { parent: true },
        });
        if (parentTag) {
          currentTag = parentTag;
        } else {
          break;
        }
      } else {
        break;
      }
    }
  }

  return hierarchicalChecks;
}
