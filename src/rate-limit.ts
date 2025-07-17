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
  if (redis) await redis.setEx(key, 3600, String(limit)); // 1 hour TTL
  return limit;
}

export async function writeRateLimit(
  tenant: string,
  limit: number,
  redis?: ReturnType<typeof import("redis").createClient>,
): Promise<void> {
  if (redis) {
    await redis.setEx(`${keyPrefix}${tenant}`, 3600, String(limit)); // 1 hour TTL
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
