import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const openaiModels = [
  // GPT-4.1 Family
  {
    model: "gpt-4.1",
    versionTag: "gpt-4.1-2025-04-14",
    inputPrice: 2.0,
    cachedInputPrice: 0.5,
    outputPrice: 8.0,
    provider: "openai",
  },
  {
    model: "gpt-4.1-mini",
    versionTag: "gpt-4.1-mini-2025-04-14",
    inputPrice: 0.4,
    cachedInputPrice: 0.1,
    outputPrice: 1.6,
    provider: "openai",
  },
  {
    model: "gpt-4.1-nano",
    versionTag: "gpt-4.1-nano-2025-04-14",
    inputPrice: 0.1,
    cachedInputPrice: 0.025,
    outputPrice: 0.4,
    provider: "openai",
  },
  // GPT-4o Family
  {
    model: "gpt-4o",
    versionTag: "gpt-4o-2024-08-06",
    inputPrice: 2.5,
    cachedInputPrice: 1.25,
    outputPrice: 10.0,
    provider: "openai",
  },
  {
    model: "gpt-4o-mini",
    versionTag: "gpt-4o-mini-2024-07-18",
    inputPrice: 0.15,
    cachedInputPrice: 0.075,
    outputPrice: 0.6,
    provider: "openai",
  },
  // O-Series Reasoning Models
  {
    model: "o1",
    versionTag: "o1-2024-12-17",
    inputPrice: 15.0,
    cachedInputPrice: 7.5,
    outputPrice: 60.0,
    provider: "openai",
  },
  {
    model: "o3",
    versionTag: "o3-2025-04-16",
    inputPrice: 2.0,
    cachedInputPrice: 0.5,
    outputPrice: 8.0,
    provider: "openai",
  },
  {
    model: "o4-mini",
    versionTag: "o4-mini-2025-04-16",
    inputPrice: 1.1,
    cachedInputPrice: 0.275,
    outputPrice: 4.4,
    provider: "openai",
  },
  {
    model: "o3-mini",
    versionTag: "o3-mini-2025-01-31",
    inputPrice: 1.1,
    cachedInputPrice: 0.55,
    outputPrice: 4.4,
    provider: "openai",
  },
  {
    model: "o1-mini",
    versionTag: "o1-mini-2024-09-12",
    inputPrice: 1.1,
    cachedInputPrice: 0.55,
    outputPrice: 4.4,
    provider: "openai",
  },
  // Specialized Models
  {
    model: "codex-mini-latest",
    versionTag: "codex-mini-latest",
    inputPrice: 1.5,
    cachedInputPrice: 0.375,
    outputPrice: 6.0,
    provider: "openai",
  },
];

async function seedOpenAIModels() {
  console.log("Seeding OpenAI models...");

  for (const modelData of openaiModels) {
    try {
      const existing = await prisma.modelPricing.findUnique({
        where: { model: modelData.model },
      });

      if (existing) {
        const updated = await prisma.modelPricing.update({
          where: { model: modelData.model },
          data: {
            provider: modelData.provider,
            versionTag: modelData.versionTag,
            inputPrice: modelData.inputPrice,
            cachedInputPrice: modelData.cachedInputPrice,
            outputPrice: modelData.outputPrice,
          },
        });
        console.log(
          `Updated ${updated.model} with provider: ${updated.provider}`,
        );
      } else {
        const created = await prisma.modelPricing.create({
          data: modelData,
        });
        console.log(
          `Created ${created.model} with provider: ${created.provider}`,
        );
      }
    } catch (error) {
      console.error(`Error seeding model ${modelData.model}:`, error);
    }
  }

  console.log("OpenAI model seeding completed!");
}

// Run if this file is executed directly
seedOpenAIModels()
  .catch((e) => {
    console.error("Error seeding OpenAI models:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export { seedOpenAIModels };
