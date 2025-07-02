export interface BudgetOptions {
  tenant: string;
  period: string;
  prisma: import("@prisma/client").PrismaClient;
  redis?: ReturnType<typeof import("redis").createClient>;
  defaultBudget: number;
}

export async function readBudget({
  tenant,
  period,
  prisma,
  redis,
  defaultBudget,
}: BudgetOptions): Promise<number> {
  const key = `budget:${tenant}:${period}`;
  if (redis) {
    const hit = await redis.get(key);
    if (hit) return parseFloat(hit);
  }
  const tenantRecord = await prisma.tenant.findFirst({
    where: { name: tenant },
  });
  if (tenantRecord) {
    const fromDb = await prisma.budget.findFirst({
      where: { tenantId: tenantRecord.id, period },
    });
    if (fromDb) {
      const amt = parseFloat(fromDb.amountUsd.toString());
      if (redis) await redis.set(key, String(amt));
      return amt;
    }
  }
  const env =
    process.env[`BUDGET_${period.toUpperCase()}_${tenant.toUpperCase()}`] ??
    process.env[`BUDGET_${period.toUpperCase()}_USD`];
  const amt = env ? Number(env) : defaultBudget;
  if (redis) await redis.set(key, String(amt));
  return amt;
}

export async function writeBudget(
  tenant: string,
  period: string,
  amount: number,
  redis?: ReturnType<typeof import("redis").createClient>,
): Promise<void> {
  if (redis) {
    await redis.set(`budget:${tenant}:${period}`, String(amount));
  }
}

export async function deleteBudget(
  tenant: string,
  period: string,
  redis?: ReturnType<typeof import("redis").createClient>,
): Promise<void> {
  if (redis) {
    await redis.del(`budget:${tenant}:${period}`);
  }
}
