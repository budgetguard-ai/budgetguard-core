import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

// In-memory cache for authenticated API keys to avoid expensive bcrypt operations
const apiKeyCache = new Map<
  string,
  {
    id: number;
    tenantId: number;
    expires: number;
    lastUsedUpdate: number;
    isActive: boolean;
  }
>();
const API_KEY_CACHE_TTL = 300000; // 5 minutes cache
const LAST_USED_UPDATE_INTERVAL = 60000; // Update lastUsedAt max once per minute

/**
 * Authenticates an API key by finding all active keys with matching prefix
 * and then comparing the hash. Uses in-memory cache to avoid expensive bcrypt operations.
 */
export async function authenticateApiKey(
  suppliedKey: string,
  prisma: PrismaClient,
): Promise<{ id: number; tenantId: number } | null> {
  if (!suppliedKey || suppliedKey.length < 8) {
    return null;
  }

  const now = Date.now();

  // Check in-memory cache first
  const cached = apiKeyCache.get(suppliedKey);
  if (cached && cached.expires > now && cached.isActive) {
    // Update lastUsedAt in background if it's been more than 1 minute
    if (now - cached.lastUsedUpdate > LAST_USED_UPDATE_INTERVAL) {
      // Non-blocking update
      prisma.apiKey
        .update({
          where: { id: cached.id },
          data: { lastUsedAt: new Date() },
        })
        .catch(() => {}); // Ignore errors for background update

      cached.lastUsedUpdate = now;
    }

    return {
      id: cached.id,
      tenantId: cached.tenantId,
    };
  }

  const keyPrefix = suppliedKey.substring(0, 8);

  // Find all active keys with matching prefix
  const candidateKeys = await prisma.apiKey.findMany({
    where: {
      keyPrefix: keyPrefix,
      isActive: true,
    },
    select: {
      id: true,
      keyHash: true,
      tenantId: true,
    },
  });

  // Check each candidate key hash
  for (const candidate of candidateKeys) {
    const isValid = await bcrypt.compare(suppliedKey, candidate.keyHash);
    if (isValid) {
      // Update last used timestamp
      await prisma.apiKey.update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date() },
      });

      // Cache the successful authentication
      apiKeyCache.set(suppliedKey, {
        id: candidate.id,
        tenantId: candidate.tenantId,
        expires: now + API_KEY_CACHE_TTL,
        lastUsedUpdate: now,
        isActive: true,
      });

      return {
        id: candidate.id,
        tenantId: candidate.tenantId,
      };
    }
  }

  return null;
}

/**
 * Invalidate API key cache entry (useful when keys are deleted/deactivated)
 */
export function invalidateApiKeyCache(suppliedKey: string): void {
  apiKeyCache.delete(suppliedKey);
}

/**
 * Mark API key as inactive in cache by ID (useful when deactivating keys)
 */
export function deactivateApiKeyInCache(keyId: number): void {
  for (const [, value] of apiKeyCache.entries()) {
    if (value.id === keyId) {
      value.isActive = false;
      break;
    }
  }
}

/**
 * Clear expired entries from API key cache (should be called periodically)
 */
export function cleanupApiKeyCache(): void {
  const now = Date.now();
  for (const [key, value] of apiKeyCache.entries()) {
    if (value.expires <= now) {
      apiKeyCache.delete(key);
    }
  }
}
