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
      input: "2.00",
      cachedInput: "0.50",
      output: "8.00",
    },
    {
      model: "gpt-4.1-mini",
      versionTag: "gpt-4.1-mini-2025-04-14",
      input: "0.40",
      cachedInput: "0.10",
      output: "1.60",
    },
    {
      model: "gpt-4.1-nano",
      versionTag: "gpt-4.1-nano-2025-04-14",
      input: "0.10",
      cachedInput: "0.025",
      output: "0.40",
    },
    {
      model: "gpt-4o",
      versionTag: "gpt-4o-2024-08-06",
      input: "2.50",
      cachedInput: "1.25",
      output: "10.00",
    },
    {
      model: "gpt-4o-mini",
      versionTag: "gpt-4o-mini-2024-07-18",
      input: "0.15",
      cachedInput: "0.075",
      output: "0.60",
    },
    {
      model: "o1",
      versionTag: "o1-2024-12-17",
      input: "15.00",
      cachedInput: "7.50",
      output: "60.00",
    },
    {
      model: "o3",
      versionTag: "o3-2025-04-16",
      input: "2.00",
      cachedInput: "0.50",
      output: "8.00",
    },
    {
      model: "o4-mini",
      versionTag: "o4-mini-2025-04-16",
      input: "1.10",
      cachedInput: "0.275",
      output: "4.40",
    },
    {
      model: "o3-mini",
      versionTag: "o3-mini-2025-01-31",
      input: "1.10",
      cachedInput: "0.55",
      output: "4.40",
    },
    {
      model: "o1-mini",
      versionTag: "o1-mini-2024-09-12",
      input: "1.10",
      cachedInput: "0.55",
      output: "4.40",
    },
    {
      model: "codex-mini-latest",
      versionTag: "codex-mini-latest",
      input: "1.50",
      cachedInput: "0.375",
      output: "6.00",
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
        provider: "openai",
      },
      create: {
        model: p.model,
        versionTag: p.versionTag,
        inputPrice: new Prisma.Decimal(p.input),
        cachedInputPrice: new Prisma.Decimal(p.cachedInput),
        outputPrice: new Prisma.Decimal(p.output),
        provider: "openai",
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
