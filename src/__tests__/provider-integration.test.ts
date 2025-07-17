import { describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getProviderForModel } from "../provider-selector.js";
import { OpenAIProvider } from "../providers/openai.js";

describe("Provider Integration Tests", () => {
  it("verifies OpenAI models route to OpenAI provider", async () => {
    const prisma = new PrismaClient();

    try {
      await prisma.$connect();

      // Test gpt-4o model
      const gpt4oProvider = await getProviderForModel("gpt-4o", prisma, {
        openaiApiKey: "test-key",
      });

      expect(gpt4oProvider).toBeInstanceOf(OpenAIProvider);

      // Test gpt-4o-mini model
      const gpt4oMiniProvider = await getProviderForModel(
        "gpt-4o-mini",
        prisma,
        {
          openaiApiKey: "test-key",
        },
      );

      expect(gpt4oMiniProvider).toBeInstanceOf(OpenAIProvider);

      // Test o1 model
      const o1Provider = await getProviderForModel("o1", prisma, {
        openaiApiKey: "test-key",
      });

      expect(o1Provider).toBeInstanceOf(OpenAIProvider);

      // Test unknown model returns null
      const unknownProvider = await getProviderForModel(
        "unknown-model",
        prisma,
        {
          openaiApiKey: "test-key",
        },
      );

      expect(unknownProvider).toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });
});
