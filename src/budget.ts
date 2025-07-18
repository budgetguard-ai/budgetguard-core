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
  if (redis) {
    const hit = await redis.get(key);
    if (hit) return deserialize(hit);
  }
  const tenantRecord = await prisma.tenant.findFirst({
    where: { name: tenant },
  });
  if (tenantRecord) {
    const fromDb = await prisma.budget.findFirst({
      where: { tenantId: tenantRecord.id, period },
    });
    if (fromDb && fromDb.startDate && fromDb.endDate) {
      const data: BudgetData = {
        amount: parseFloat(fromDb.amountUsd.toString()),
        startDate: fromDb.startDate,
        endDate: fromDb.endDate,
      };
      if (redis) await redis.setEx(key, 3600, serialize(data)); // 1 hour TTL
      return data;
    }
  }

  const amountEnv =
    process.env[`BUDGET_${period.toUpperCase()}_${tenant.toUpperCase()}`] ??
    process.env[`BUDGET_${period.toUpperCase()}_USD`];
  const amount = amountEnv ? Number(amountEnv) : defaultBudget;
  const now = new Date();
  let startDate: Date;
  let endDate: Date;
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
    const s = process.env.BUDGET_START_DATE;
    const e = process.env.BUDGET_END_DATE;
    if (!s || !e) {
      throw new Error("Missing custom budget window");
    }
    startDate = new Date(s);
    endDate = new Date(e);
    endDate.setUTCHours(23, 59, 59, 999);
  }
  const data: BudgetData = { amount, startDate, endDate };
  if (redis) await redis.setEx(key, 3600, serialize(data)); // 1 hour TTL
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
