export interface CacheOptions {
  redis?: ReturnType<typeof import("redis").createClient>;
  ttl?: number; // seconds
}

/**
 * Clear all cache entries for a specific tenant
 */
export async function clearTenantCache(
  tenant: string,
  redis?: ReturnType<typeof import("redis").createClient>
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
      await redis.del(...keys);
    }
  }
}

/**
 * Clear specific budget cache for a tenant
 */
export async function clearBudgetCache(
  tenant: string,
  period?: string,
  redis?: ReturnType<typeof import("redis").createClient>
): Promise<void> {
  if (!redis) return;

  if (period) {
    await redis.del(`budget:${tenant}:${period}`);
  } else {
    const keys = await redis.keys(`budget:${tenant}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

/**
 * Set cache with automatic TTL
 */
export async function setCacheWithTTL(
  key: string,
  value: string,
  options: CacheOptions
): Promise<void> {
  if (!options.redis) return;
  
  const ttl = options.ttl || 3600; // Default 1 hour
  await options.redis.setEx(key, ttl, value);
}