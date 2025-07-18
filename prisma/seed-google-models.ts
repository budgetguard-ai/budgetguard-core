import { PrismaClient, Prisma } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Google Gemini models...");

  // Google Gemini models with tiered pricing
  const googleModels = [
    {
      model: "gemini-2.5-pro-low",
      versionTag: "gemini-2.5-pro-low",
      input: "1.25",
      cachedInput: "0.31",
      output: "10.00",
    },
    {
      model: "gemini-2.5-pro-high",
      versionTag: "gemini-2.5-pro-high",
      input: "2.50",
      cachedInput: "0.625",
      output: "15.00",
    },
    {
      model: "gemini-2.5-flash",
      versionTag: "gemini-2.5-flash",
      input: "0.30",
      cachedInput: "0.075",
      output: "2.50",
    },
    {
      model: "gemini-2.0-flash",
      versionTag: "gemini-2.0-flash",
      input: "0.10",
      cachedInput: "0.025",
      output: "0.40",
    },
    {
      model: "gemini-2.0-flash-lite",
      versionTag: "gemini-2.0-flash-lite",
      input: "0.075",
      cachedInput: "0.075",
      output: "0.30",
    },
  ];

  for (const p of googleModels) {
    await prisma.modelPricing.upsert({
      where: { model: p.model },
      update: {
        versionTag: p.versionTag,
        inputPrice: new Prisma.Decimal(p.input),
        cachedInputPrice: new Prisma.Decimal(p.cachedInput),
        outputPrice: new Prisma.Decimal(p.output),
        provider: "google",
      },
      create: {
        model: p.model,
        versionTag: p.versionTag,
        inputPrice: new Prisma.Decimal(p.input),
        cachedInputPrice: new Prisma.Decimal(p.cachedInput),
        outputPrice: new Prisma.Decimal(p.output),
        provider: "google",
      },
    });
  }

  console.log("Google Gemini models seeded successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
