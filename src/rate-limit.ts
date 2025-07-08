export interface RateLimitOptions {
  tenant: string;
  prisma: import("@prisma/client").PrismaClient;
  redis?: ReturnType<typeof import("redis").createClient>;
  defaultLimit: number;
}

const keyPrefix = "ratelimit:";

export async function readRateLimit({
  tenant,
  prisma,
  redis,
  defaultLimit,
}: RateLimitOptions): Promise<number> {
  const key = `${keyPrefix}${tenant}`;
  if (redis) {
    const hit = await redis.get(key);
    if (hit !== null) return Number(hit);
  }
  const rec = await prisma.tenant.findFirst({ where: { name: tenant } });
  const value = rec?.rateLimitPerMin;
  const limit = value === null || value === undefined ? defaultLimit : value;
  if (redis) await redis.set(key, String(limit));
  return limit;
}

export async function writeRateLimit(
  tenant: string,
  limit: number,
  redis?: ReturnType<typeof import("redis").createClient>,
): Promise<void> {
  if (redis) {
    await redis.set(`${keyPrefix}${tenant}`, String(limit));
  }
}

export async function deleteRateLimit(
  tenant: string,
  redis?: ReturnType<typeof import("redis").createClient>,
): Promise<void> {
  if (redis) {
    await redis.del(`${keyPrefix}${tenant}`);
  }
}
