import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  getProviderForModel,
  DatabaseProviderSelector,
} from "../provider-selector.js";
import { OpenAIProvider } from "../providers/openai.js";
import { AnthropicProvider } from "../providers/anthropic.js";

vi.mock("@prisma/client", () => {
  class MockPrisma {
    modelPricing = {
      findUnique: vi.fn(),
    };
  }

  class Decimal {
    private val: string;
    constructor(v: number | string) {
      this.val = String(v);
    }
    toString() {
      return this.val;
    }
    toJSON() {
      return this.val;
    }
  }

  const Prisma = { Decimal };
  return { PrismaClient: MockPrisma, Prisma };
});

describe("Provider Selection Logic", () => {
  let mockPrisma: PrismaClient;

  beforeAll(() => {
    mockPrisma = new PrismaClient();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it("returns OpenAI provider for gpt-4o model", async () => {
    mockPrisma.modelPricing.findUnique.mockResolvedValue({
      id: 1,
      model: "gpt-4o",
      versionTag: "gpt-4o-2024-08-06",
      inputPrice: "2.50",
      cachedInputPrice: "1.25",
      outputPrice: "10.00",
      provider: "openai",
    });

    const provider = await getProviderForModel("gpt-4o", mockPrisma, {
      openaiApiKey: "test-key",
    });

    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(mockPrisma.modelPricing.findUnique).toHaveBeenCalledWith({
      where: { model: "gpt-4o" },
    });
  });

  it("returns OpenAI provider for gpt-4o-mini model", async () => {
    mockPrisma.modelPricing.findUnique.mockResolvedValue({
      id: 2,
      model: "gpt-4o-mini",
      versionTag: "gpt-4o-mini-2024-07-18",
      inputPrice: "0.15",
      cachedInputPrice: "0.075",
      outputPrice: "0.60",
      provider: "openai",
    });

    const provider = await getProviderForModel("gpt-4o-mini", mockPrisma, {
      openaiApiKey: "test-key",
    });

    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it("returns null for unknown model", async () => {
    mockPrisma.modelPricing.findUnique.mockResolvedValue(null);

    const provider = await getProviderForModel("unknown-model", mockPrisma, {
      openaiApiKey: "test-key",
    });

    expect(provider).toBeNull();
  });

  it("returns null for model without provider field", async () => {
    mockPrisma.modelPricing.findUnique.mockResolvedValue({
      id: 3,
      model: "legacy-model",
      versionTag: "v1",
      inputPrice: "1.00",
      cachedInputPrice: "0.50",
      outputPrice: "2.00",
      provider: null,
    });

    const provider = await getProviderForModel("legacy-model", mockPrisma, {
      openaiApiKey: "test-key",
    });

    expect(provider).toBeNull();
  });

  it("throws error when OpenAI API key is missing", async () => {
    mockPrisma.modelPricing.findUnique.mockResolvedValue({
      id: 1,
      model: "gpt-4o",
      provider: "openai",
    });

    await expect(getProviderForModel("gpt-4o", mockPrisma, {})).rejects.toThrow(
      "OpenAI API key not configured",
    );
  });

  it("returns Anthropic provider for Claude models", async () => {
    mockPrisma.modelPricing.findUnique.mockResolvedValue({
      id: 4,
      model: "claude-3-5-sonnet-latest",
      versionTag: "claude-3-5-sonnet-20241022",
      inputPrice: "3.00",
      cachedInputPrice: "0.30",
      outputPrice: "15.00",
      provider: "anthropic",
    });

    const provider = await getProviderForModel(
      "claude-3-5-sonnet-latest",
      mockPrisma,
      {
        anthropicApiKey: "test-anthropic-key",
      },
    );

    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it("returns Anthropic provider for Claude Opus models", async () => {
    mockPrisma.modelPricing.findUnique.mockResolvedValue({
      id: 5,
      model: "claude-opus-4-0",
      versionTag: "claude-opus-4-0-20250514",
      inputPrice: "15.00",
      cachedInputPrice: "1.50",
      outputPrice: "75.00",
      provider: "anthropic",
    });

    const provider = await getProviderForModel("claude-opus-4-0", mockPrisma, {
      anthropicApiKey: "test-anthropic-key",
    });

    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it("throws error when Anthropic API key is missing", async () => {
    mockPrisma.modelPricing.findUnique.mockResolvedValue({
      id: 4,
      model: "claude-3-5-sonnet-latest",
      provider: "anthropic",
    });

    await expect(
      getProviderForModel("claude-3-5-sonnet-latest", mockPrisma, {}),
    ).rejects.toThrow("Anthropic API key not configured");
  });

  describe("DatabaseProviderSelector class", () => {
    it("works with class-based usage", async () => {
      mockPrisma.modelPricing.findUnique.mockResolvedValue({
        id: 1,
        model: "gpt-4o",
        provider: "openai",
      });

      const selector = new DatabaseProviderSelector(mockPrisma, {
        openaiApiKey: "test-key",
      });

      const provider = await selector.getProviderForModel("gpt-4o");
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });
  });
});
