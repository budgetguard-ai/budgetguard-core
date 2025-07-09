import { PrismaClient, Prisma } from "@prisma/client";
import dotenv from "dotenv";
import { randomBytes } from "crypto";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const tenantName = process.env.DEFAULT_TENANT || "public";
  const tenant = await prisma.tenant.upsert({
    where: { name: tenantName },
    update: {},
    create: { name: tenantName },
  });

  if (process.env.MAX_REQS_PER_MIN) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { rateLimitPerMin: Number(process.env.MAX_REQS_PER_MIN) },
    });
  }

  const apiKey = process.env.DEFAULT_API_KEY || randomBytes(16).toString("hex");
  await prisma.apiKey.upsert({
    where: { key: apiKey },
    update: {},
    create: { key: apiKey, tenantId: tenant.id },
  });
  if (!process.env.DEFAULT_API_KEY) {
    console.log(`Created API key: ${apiKey}`);
  }

  const budgets: Array<{ period: string; amountUsd: string }> = [];
  if (process.env.BUDGET_DAILY_USD) {
    budgets.push({ period: "daily", amountUsd: process.env.BUDGET_DAILY_USD });
  }
  if (process.env.BUDGET_MONTHLY_USD) {
    budgets.push({
      period: "monthly",
      amountUsd: process.env.BUDGET_MONTHLY_USD,
    });
  }

  for (const b of budgets) {
    const exists = await prisma.budget.findFirst({
      where: { tenantId: tenant.id, period: b.period },
    });
    if (!exists) {
      await prisma.budget.create({
        data: {
          tenantId: tenant.id,
          period: b.period,
          amountUsd: new Prisma.Decimal(b.amountUsd),
        },
      });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
