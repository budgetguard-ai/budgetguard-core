export interface BudgetOptions {
  tenant: string;
  period: string;
  prisma: import("@prisma/client").PrismaClient;
  redis?: ReturnType<typeof import("redis").createClient>;
  defaultBudget: number;
}

export interface BudgetData {
  amount: number;
  startDate: Date;
  endDate: Date;
}

function serialize(data: BudgetData): string {
  return JSON.stringify({
    amount: data.amount,
    startDate: data.startDate.toISOString(),
    endDate: data.endDate.toISOString(),
  });
}

function deserialize(raw: string): BudgetData {
  const parsed = JSON.parse(raw) as {
    amount: number;
    startDate: string;
    endDate: string;
  };
  return {
    amount: parsed.amount,
    startDate: new Date(parsed.startDate),
    endDate: new Date(parsed.endDate),
  };
}

export async function readBudget({
  tenant,
  period,
  prisma,
  redis,
  defaultBudget,
}: BudgetOptions): Promise<BudgetData> {
  const key = `budget:${tenant}:${period}`;

  // First, check Redis cache
  if (redis) {
    const hit = await redis.get(key);
    if (hit) return deserialize(hit);
  }

  // For recurring budgets (daily/monthly), check if we have a budget configured
  const tenantRecord = await prisma.tenant.findFirst({
    where: { name: tenant },
  });

  let budgetAmount = defaultBudget;
  let hasBudgetConfig = false;

  if (tenantRecord) {
    const fromDb = await prisma.budget.findFirst({
      where: { tenantId: tenantRecord.id, period },
    });

    if (fromDb) {
      budgetAmount = parseFloat(fromDb.amountUsd.toString());
      hasBudgetConfig = true;

      // For custom budgets, use the exact dates from database
      if (
        period === "custom" &&
        fromDb.startDate !== null &&
        fromDb.endDate !== null
      ) {
        const data: BudgetData = {
          amount: budgetAmount,
          startDate: fromDb.startDate,
          endDate: fromDb.endDate,
        };
        if (redis) await redis.setEx(key, 3600, serialize(data));
        return data;
      }
    }
  }

  // Only use environment variable if no budget was configured in DB
  if (!hasBudgetConfig) {
    const amountEnv =
      process.env[`BUDGET_${period.toUpperCase()}_${tenant.toUpperCase()}`] ??
      process.env[`BUDGET_${period.toUpperCase()}_USD`];
    if (amountEnv) budgetAmount = Number(amountEnv);
  }

  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  // For daily and monthly budgets, always calculate current period (recurring behavior)
  if (period === "monthly") {
    startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    endDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
  } else if (period === "daily") {
    startDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    endDate = new Date(startDate.getTime() + 86400000 - 1);
  } else {
    // Custom budget fallback (should not reach here if custom budget exists in DB)
    const s = process.env.BUDGET_START_DATE;
    const e = process.env.BUDGET_END_DATE;
    if (!s || !e) {
      throw new Error("Missing custom budget window");
    }
    startDate = new Date(s);
    endDate = new Date(e);
    endDate.setUTCHours(23, 59, 59, 999);
  }

  const data: BudgetData = { amount: budgetAmount, startDate, endDate };

  // Cache with shorter TTL for recurring budgets to ensure they refresh at period boundaries
  const cacheTTL =
    period === "daily" ? 300 : period === "monthly" ? 1800 : 3600; // 5min, 30min, 1hr
  if (redis) await redis.setEx(key, cacheTTL, serialize(data));
  return data;
}

export async function writeBudget(
  tenant: string,
  period: string,
  amount: number,
  startDate: Date,
  endDate: Date,
  redis?: ReturnType<typeof import("redis").createClient>,
): Promise<void> {
  if (redis) {
    const data: BudgetData = { amount, startDate, endDate };
    await redis.setEx(`budget:${tenant}:${period}`, 3600, serialize(data)); // 1 hour TTL
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
