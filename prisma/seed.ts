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

  const pricing = [
    {
      model: "gpt-4.1",
      versionTag: "gpt-4.1-2025-04-14",
      input: "10",
      cachedInput: "2",
      output: "30",
    },
    {
      model: "gpt-4.1-mini",
      versionTag: "gpt-4.1-mini-2025-04-14",
      input: "5",
      cachedInput: "1",
      output: "15",
    },
    {
      model: "gpt-4.1-nano",
      versionTag: "gpt-4.1-nano-2025-04-14",
      input: "1",
      cachedInput: "0.2",
      output: "3",
    },
    {
      model: "gpt-4o",
      versionTag: "gpt-4o-2025-05-10",
      input: "5",
      cachedInput: "1",
      output: "15",
    },
    {
      model: "gpt-4o-mini",
      versionTag: "gpt-4o-mini-2025-05-10",
      input: "3",
      cachedInput: "0.6",
      output: "10",
    },
  ];

  for (const p of pricing) {
    await prisma.modelPricing.upsert({
      where: { model: p.model },
      update: {
        versionTag: p.versionTag,
        inputPrice: new Prisma.Decimal(p.input),
        cachedInputPrice: new Prisma.Decimal(p.cachedInput),
        outputPrice: new Prisma.Decimal(p.output),
      },
      create: {
        model: p.model,
        versionTag: p.versionTag,
        inputPrice: new Prisma.Decimal(p.input),
        cachedInputPrice: new Prisma.Decimal(p.cachedInput),
        outputPrice: new Prisma.Decimal(p.output),
      },
    });
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
