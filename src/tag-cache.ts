import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";

export interface CachedTag {
  id: number;
  name: string;
  tenantId: number;
  level: number;
  isActive: boolean;
  path?: string;
  parentId?: number;
}

export interface ValidatedTag {
  id: number;
  name: string;
  weight: number;
}

// Cache TTLs
const TAG_CACHE_TTL = 5 * 60; // 5 minutes
const TAG_SET_CACHE_TTL = 2 * 60; // 2 minutes

/**
 * Get tags for a tenant with Redis caching
 */
export async function getCachedTags(
  tenantId: number,
  redis?: ReturnType<typeof createClient>,
  prisma?: PrismaClient,
): Promise<CachedTag[]> {
  // Fallback to individual cache lookup
  const cacheKey = `tags:tenant:${tenantId}`;

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as CachedTag[];
      }
    } catch (error) {
      console.warn("Redis error fetching tags cache:", error);
    }
  }

  // Fallback to database
  if (!prisma) {
    return [];
  }

  const tags = await prisma.tag.findMany({
    where: {
      tenantId,
      isActive: true,
    },
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

  const cachedTags: CachedTag[] = tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    tenantId: tag.tenantId,
    level: tag.level,
    isActive: tag.isActive,
    path: tag.path || undefined,
    parentId: tag.parentId || undefined,
  }));

  // Cache the result
  if (redis) {
    try {
      await redis.setEx(cacheKey, TAG_CACHE_TTL, JSON.stringify(cachedTags));
    } catch (error) {
      console.warn("Redis error setting tags cache:", error);
    }
  }

  return cachedTags;
}

/**
 * Validate and cache tag sets for performance
 */
export async function validateAndCacheTagSet(
  tagNames: string[],
  tenantId: number,
  redis?: ReturnType<typeof createClient>,
  prisma?: PrismaClient,
): Promise<ValidatedTag[]> {
  // Create cache key for this specific tag set
  const sortedTagNames = [...tagNames].sort();
  const tagSetKey = `tagset:${tenantId}:${sortedTagNames.join(",")}`;

  if (redis) {
    try {
      const cached = await redis.get(tagSetKey);
      if (cached) {
        return JSON.parse(cached) as ValidatedTag[];
      }
    } catch (error) {
      console.warn("Redis error fetching tag set cache:", error);
    }
  }

  // Get all tags for this tenant
  const allTags = await getCachedTags(tenantId, redis, prisma);

  // Find requested tags
  const validatedTags: ValidatedTag[] = [];
  const foundTagNames: string[] = [];

  for (const tagName of tagNames) {
    const tag = allTags.find((t) => t.name === tagName && t.isActive);
    if (tag) {
      const validatedTag = {
        id: tag.id,
        name: tag.name,
        weight: 1.0, // Default weight
      };

      // Debug logging for validated tag weight
      console.log(
        `ValidatedTag creation: ${tag.name} -> weight=${validatedTag.weight}`,
      );

      validatedTags.push(validatedTag);
      foundTagNames.push(tag.name);
    }
  }

  // Check for missing tags
  const missingTags = tagNames.filter((name) => !foundTagNames.includes(name));
  if (missingTags.length > 0) {
    throw new Error(
      `Tags not found for this tenant: ${missingTags.join(", ")}`,
    );
  }

  // Cache the validated result
  if (redis) {
    try {
      await redis.setEx(
        tagSetKey,
        TAG_SET_CACHE_TTL,
        JSON.stringify(validatedTags),
      );
    } catch (error) {
      console.warn("Redis error setting tag set cache:", error);
    }
  }

  return validatedTags;
}

/**
 * Invalidate tag caches when tags are modified
 */
export async function invalidateTagCache(
  tenantId: number,
  redis?: ReturnType<typeof createClient>,
): Promise<void> {
  if (!redis) return;

  try {
    // Invalidate tenant's tag cache
    await redis.del(`tags:tenant:${tenantId}`);

    // Invalidate all tag set caches for this tenant
    const pattern = `tagset:${tenantId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    console.warn("Redis error invalidating tag cache:", error);
  }
}

/**
 * Get tag usage cache key for budget tracking
 */
export function getTagUsageCacheKey(
  tenantName: string,
  tagId: number,
  period: string,
  date?: Date,
): string {
  const dateStr = date
    ? date.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return `tag_usage:${tenantName}:${tagId}:${period}:${dateStr}`;
}

/**
 * Cache tag usage for budget calculations
 */
export async function cacheTagUsage(
  tenantName: string,
  tagId: number,
  period: string,
  usage: number,
  redis?: ReturnType<typeof createClient>,
  ttl: number = 30 * 60, // 30 minutes default
): Promise<void> {
  if (!redis) return;

  const cacheKey = getTagUsageCacheKey(tenantName, tagId, period);

  try {
    await redis.setEx(cacheKey, ttl, usage.toString());
  } catch (error) {
    console.warn("Redis error caching tag usage:", error);
  }
}

/**
 * Increment tag usage cache for real-time updates
 */
export async function incrementTagUsage(
  tenantName: string,
  tagId: number,
  period: string,
  incrementAmount: number,
  redis?: ReturnType<typeof createClient>,
  ttl: number = 30 * 60, // 30 minutes default
): Promise<void> {
  if (!redis) return;

  const cacheKey = getTagUsageCacheKey(tenantName, tagId, period);

  try {
    // Use Redis INCRBYFLOAT for atomic increment
    await redis.incrByFloat(cacheKey, incrementAmount);

    // Set TTL if this is a new key
    const keyTtl = await redis.ttl(cacheKey);
    if (keyTtl === -1) {
      await redis.expire(cacheKey, ttl);
    }
  } catch (error) {
    console.warn("Redis error incrementing tag usage:", error);
  }
}

/**
 * Get cached tag usage for budget calculations with batch optimization
 */
export async function getCachedTagUsage(
  tenantName: string,
  tagId: number,
  period: string,
  redis?: ReturnType<typeof createClient>,
): Promise<number | null> {
  if (!redis) return null;

  const cacheKey = getTagUsageCacheKey(tenantName, tagId, period);

  try {
    const cached = await redis.get(cacheKey);
    return cached ? parseFloat(cached) : null;
  } catch (error) {
    console.warn("Redis error fetching tag usage cache:", error);
    return null;
  }
}

/**
 * Batch get multiple tag usages with single Redis mGet call
 */
export async function getBatchTagUsages(
  tenantName: string,
  tagIds: number[],
  periods: string[],
  redis?: ReturnType<typeof createClient>,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};

  if (!redis || tagIds.length === 0 || periods.length === 0) {
    return result;
  }

  // Build all cache keys for batch mGet operation
  const cacheKeys: string[] = [];
  const keyMap: Record<string, string> = {};

  tagIds.forEach((tagId) => {
    periods.forEach((period) => {
      const cacheKey = getTagUsageCacheKey(tenantName, tagId, period);
      const resultKey = `${tagId}_${period}`;
      cacheKeys.push(cacheKey);
      keyMap[cacheKey] = resultKey;
    });
  });

  try {
    const cacheValues = await redis.mGet(cacheKeys);

    cacheKeys.forEach((key, index) => {
      const value = cacheValues[index];
      if (value) {
        const resultKey = keyMap[key];
        result[resultKey] = parseFloat(value);
      }
    });
  } catch (error) {
    console.warn("Redis error fetching batch tag usage cache:", error);
  }

  return result;
}
