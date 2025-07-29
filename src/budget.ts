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
    if (hit) {
      console.log(`Budget cache HIT for ${key}`);
      return deserialize(hit);
    } else {
      console.log(`Budget cache MISS for ${key}`);
    }
  }

  // For recurring budgets (daily/monthly), check if we have a budget configured
  const tenantCacheKey = `tenant:${tenant}`;
  let tenantRecord = null;

  // Try Redis cache first
  if (redis) {
    const cached = await redis.get(tenantCacheKey);
    if (cached) {
      console.log(`Tenant cache HIT for ${tenant}`);
      tenantRecord = JSON.parse(cached);
    } else {
      console.log(`Tenant cache MISS for ${tenant}`);
    }
  }

  // Fallback to database if not cached
  if (!tenantRecord) {
    tenantRecord = await prisma.tenant.findFirst({
      where: { name: tenant },
    });

    // Cache for 1 hour if found
    if (tenantRecord && redis) {
      console.log(`Caching tenant ${tenant}:`, tenantRecord);
      await redis.setEx(tenantCacheKey, 3600, JSON.stringify(tenantRecord));
    } else {
      console.log(
        `NOT caching tenant ${tenant}. tenantRecord:`,
        tenantRecord,
        "redis:",
        !!redis,
      );
    }
  }

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

// ULTRA-optimized function to batch ALL Redis calls (budgets + tenant + rate limit + usage) in ONE call
export async function readBudgetsOptimized(
  tenant: string,
  periods: string[],
  prisma: import("@prisma/client").PrismaClient,
  redis: ReturnType<typeof import("redis").createClient> | undefined,
  defaultBudget: number,
  ledgerKeyFn: (
    period: "custom" | "monthly" | "daily",
    date?: Date,
    window?: { startDate: Date; endDate: Date },
  ) => string,
): Promise<{
  budgets: Array<{
    period: string;
    usage: number;
    budget: number;
    start: string;
    end: string;
  }>;
  rateLimit: number;
}> {
  if (!redis || periods.length === 0) {
    return { budgets: [], rateLimit: 100 };
  }

  // Step 1: Batch read ALL cache keys (budgets + tenant + rate limit) in ONE call
  const budgetKeys = periods.map((period) => `budget:${tenant}:${period}`);
  const tenantCacheKey = `tenant:${tenant}`;
  const rateLimitKey = `ratelimit:${tenant}`;
  const allCacheKeys = [...budgetKeys, tenantCacheKey, rateLimitKey];

  const cacheValues = await redis.mGet(allCacheKeys);

  // Parse results
  const budgetCacheResults = cacheValues.slice(0, periods.length);
  const tenantCacheResult = cacheValues[periods.length];
  const rateLimitCacheResult = cacheValues[periods.length + 1];

  // Step 2: Get tenant record and rate limit (cached or from DB)
  let tenantRecord = null;
  let rateLimit = 100; // default

  if (tenantCacheResult) {
    tenantRecord = JSON.parse(tenantCacheResult);
  } else {
    tenantRecord = await prisma.tenant.findFirst({
      where: { name: tenant },
    });

    // Cache tenant for 1 hour if found
    if (tenantRecord) {
      await redis.setEx(tenantCacheKey, 3600, JSON.stringify(tenantRecord));
    }
  }

  // Extract rate limit
  if (rateLimitCacheResult) {
    rateLimit = Number(rateLimitCacheResult);
  } else {
    if (
      tenantRecord?.rateLimitPerMin !== null &&
      tenantRecord?.rateLimitPerMin !== undefined
    ) {
      rateLimit = tenantRecord.rateLimitPerMin;
    }
    // Cache rate limit for 1 hour
    await redis.setEx(rateLimitKey, 3600, String(rateLimit));
  }

  // Step 3: Process each period and collect usage keys for batching
  const validPeriods: Array<{
    period: string;
    amount: number;
    startDate: Date;
    endDate: Date;
    usageIndex: number;
  }> = [];
  const usageKeys: string[] = [];
  const now = new Date();

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const cacheHit = budgetCacheResults[i];

    let budgetData;
    if (cacheHit) {
      budgetData = deserialize(cacheHit);
    } else {
      // Fallback to individual readBudget (which will handle DB logic and caching)
      budgetData = await readBudget({
        tenant,
        period,
        prisma,
        redis,
        defaultBudget,
      });
    }

    const { amount, startDate, endDate } = budgetData;

    // Only include periods that are currently active
    if (now >= startDate && now <= endDate) {
      const usageKey = `ledger:${tenant}:${ledgerKeyFn(period as "custom" | "monthly" | "daily", now, { startDate, endDate })}`;
      usageKeys.push(usageKey);
      validPeriods.push({
        period,
        amount,
        startDate,
        endDate,
        usageIndex: usageKeys.length - 1,
      });
    }
  }

  // Step 4: Batch read all usage data
  let usageValues: (string | null)[] = [];
  if (usageKeys.length > 0) {
    usageValues = await redis.mGet(usageKeys);
  }

  // Step 5: Build final result
  const budgets = validPeriods.map(
    ({ period, amount, startDate, endDate, usageIndex }) => ({
      period,
      usage: usageValues[usageIndex] ? parseFloat(usageValues[usageIndex]) : 0,
      budget: amount,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    }),
  );

  return { budgets, rateLimit };
}
