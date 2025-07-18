import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const anthropicModels = [
  // Claude 4 Family
  {
    model: "claude-opus-4-0",
    versionTag: "claude-opus-4-0-20250514",
    inputPrice: 15.0,
    cachedInputPrice: 1.5, // Cache hits/refreshes price
    outputPrice: 75.0,
    provider: "anthropic",
  },
  {
    model: "claude-sonnet-4-0",
    versionTag: "claude-sonnet-4-0-20250514",
    inputPrice: 3.0,
    cachedInputPrice: 0.3, // Cache hits/refreshes price
    outputPrice: 15.0,
    provider: "anthropic",
  },
  // Claude 3.7 Family
  {
    model: "claude-3-7-sonnet-latest",
    versionTag: "claude-3-7-sonnet-20241022",
    inputPrice: 3.0,
    cachedInputPrice: 0.3, // Cache hits/refreshes price
    outputPrice: 15.0,
    provider: "anthropic",
  },
  // Claude 3.5 Family
  {
    model: "claude-3-5-sonnet-latest",
    versionTag: "claude-3-5-sonnet-20241022",
    inputPrice: 3.0,
    cachedInputPrice: 0.3, // Cache hits/refreshes price
    outputPrice: 15.0,
    provider: "anthropic",
  },
  {
    model: "claude-3-5-sonnet-20241022",
    versionTag: "claude-3-5-sonnet-20241022",
    inputPrice: 3.0,
    cachedInputPrice: 0.3, // Cache hits/refreshes price
    outputPrice: 15.0,
    provider: "anthropic",
  },
  {
    model: "claude-3-5-haiku-latest",
    versionTag: "claude-3-5-haiku-20241022",
    inputPrice: 0.8,
    cachedInputPrice: 0.08, // Cache hits/refreshes price
    outputPrice: 4.0,
    provider: "anthropic",
  },
  {
    model: "claude-3-5-haiku-20241022",
    versionTag: "claude-3-5-haiku-20241022",
    inputPrice: 0.8,
    cachedInputPrice: 0.08, // Cache hits/refreshes price
    outputPrice: 4.0,
    provider: "anthropic",
  },
  // Claude 3 Family (Legacy)
  {
    model: "claude-3-opus-20240229",
    versionTag: "claude-3-opus-20240229",
    inputPrice: 15.0,
    cachedInputPrice: 1.5, // Estimated cache price
    outputPrice: 75.0,
    provider: "anthropic",
  },
  {
    model: "claude-3-sonnet-20240229",
    versionTag: "claude-3-sonnet-20240229",
    inputPrice: 3.0,
    cachedInputPrice: 0.3, // Estimated cache price
    outputPrice: 15.0,
    provider: "anthropic",
  },
  {
    model: "claude-3-haiku-20240307",
    versionTag: "claude-3-haiku-20240307",
    inputPrice: 0.25,
    cachedInputPrice: 0.025, // Estimated cache price
    outputPrice: 1.25,
    provider: "anthropic",
  },
];

async function seedAnthropicModels() {
  console.log("Seeding Anthropic Claude models...");

  for (const modelData of anthropicModels) {
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

  console.log("Anthropic Claude model seeding completed!");
}

// Run if this file is executed directly
seedAnthropicModels()
  .catch((e) => {
    console.error("Error seeding Anthropic models:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export { seedAnthropicModels };
