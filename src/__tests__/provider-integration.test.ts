import { describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getProviderForModel } from "../provider-selector.js";
import { OpenAIProvider } from "../providers/openai.js";
import { AnthropicProvider } from "../providers/anthropic.js";
import { GoogleProvider } from "../providers/google.js";

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

  it("verifies Anthropic Claude models route to Anthropic provider", async () => {
    const prisma = new PrismaClient();

    try {
      await prisma.$connect();

      // Test Claude Sonnet model
      const claudeSonnetProvider = await getProviderForModel(
        "claude-3-5-sonnet-latest",
        prisma,
        {
          anthropicApiKey: "test-anthropic-key",
        },
      );

      expect(claudeSonnetProvider).toBeInstanceOf(AnthropicProvider);

      // Test Claude Haiku model
      const claudeHaikuProvider = await getProviderForModel(
        "claude-3-5-haiku-latest",
        prisma,
        {
          anthropicApiKey: "test-anthropic-key",
        },
      );

      expect(claudeHaikuProvider).toBeInstanceOf(AnthropicProvider);

      // Test Claude Opus model
      const claudeOpusProvider = await getProviderForModel(
        "claude-opus-4-0",
        prisma,
        {
          anthropicApiKey: "test-anthropic-key",
        },
      );

      expect(claudeOpusProvider).toBeInstanceOf(AnthropicProvider);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("verifies Google Gemini models route to Google provider", async () => {
    const prisma = new PrismaClient();

    try {
      await prisma.$connect();

      // Test Gemini 2.0 Flash model
      const gemini20FlashProvider = await getProviderForModel(
        "gemini-2.0-flash",
        prisma,
        {
          googleApiKey: "test-google-key",
        },
      );

      expect(gemini20FlashProvider).toBeInstanceOf(GoogleProvider);

      // Test Gemini 2.5 Flash model
      const gemini25FlashProvider = await getProviderForModel(
        "gemini-2.5-flash",
        prisma,
        {
          googleApiKey: "test-google-key",
        },
      );

      expect(gemini25FlashProvider).toBeInstanceOf(GoogleProvider);

      // Test Gemini 2.5 Pro Low model
      const gemini25ProLowProvider = await getProviderForModel(
        "gemini-2.5-pro-low",
        prisma,
        {
          googleApiKey: "test-google-key",
        },
      );

      expect(gemini25ProLowProvider).toBeInstanceOf(GoogleProvider);

      // Test Gemini 2.5 Pro High model
      const gemini25ProHighProvider = await getProviderForModel(
        "gemini-2.5-pro-high",
        prisma,
        {
          googleApiKey: "test-google-key",
        },
      );

      expect(gemini25ProHighProvider).toBeInstanceOf(GoogleProvider);
    } finally {
      await prisma.$disconnect();
    }
  });
});
