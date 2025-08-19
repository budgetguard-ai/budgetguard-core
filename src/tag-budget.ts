import { PrismaClient } from "@prisma/client";
import { readBudget } from "./budget.js";
import { getCachedTagUsage, cacheTagUsage } from "./tag-cache.js";
import { createClient } from "redis";

// Cache TTL for tag budget configuration
const TAG_BUDGET_CONFIG_TTL = 30 * 60; // 30 minutes, same as tag session budget TTL

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
    if (cached !== null) {
      return JSON.parse(cached) as CachedTagBudget[];
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

          // Try to get cached usage first
          usage =
            (await getCachedTagUsage(
              tenant,
              validatedTag.id,
              tagBudget.period,
              redis,
            )) ?? 0;

          if (usage === 0) {
            // Cache miss - get from database
            usage = await getTagUsageFromDatabase(
              tenantId,
              validatedTag.id,
              budgetData.startDate,
              budgetData.endDate,
              prisma,
            );

            // Cache the result for future requests
            if (usage > 0) {
              await cacheTagUsage(
                tenant,
                validatedTag.id,
                tagBudget.period,
                usage,
                redis,
              );
            }
          }
        } else if (
          tagBudget.period === "custom" &&
          tagBudget.startDate &&
          tagBudget.endDate
        ) {
          // For custom periods, use the budget's own dates
          usage = await getTagUsageFromDatabase(
            tenantId,
            validatedTag.id,
            tagBudget.startDate,
            tagBudget.endDate,
            prisma,
          );
        }

        // Apply weight to usage
        const weightedUsage = usage * tagBudget.weight * validatedTag.weight;
        const budgetAmount = parseFloat(tagBudget.amountUsd);

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
              redis: undefined, // Not using Redis cache for hierarchical checks
              defaultBudget: 0,
            });

            parentUsage = await getTagUsageFromDatabase(
              tenantId,
              currentTag.parent.id,
              budgetData.startDate,
              budgetData.endDate,
              prisma,
            );
          } else if (
            parentBudget.period === "custom" &&
            parentBudget.startDate &&
            parentBudget.endDate
          ) {
            // For custom periods, use the budget's own dates
            parentUsage = await getTagUsageFromDatabase(
              tenantId,
              currentTag.parent.id,
              parentBudget.startDate,
              parentBudget.endDate,
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
