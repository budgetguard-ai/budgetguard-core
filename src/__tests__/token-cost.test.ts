import { describe, it, expect, vi } from "vitest";
import { countTokensAndCost } from "../token";
import { PrismaClient } from "@prisma/client";

// Mock PrismaClient
const mockPrisma = {
  modelPricing: {
    findUnique: vi.fn(),
  },
} as unknown as PrismaClient;

describe("token + cost", () => {
  it("calculates gpt-3.5 completion cost", async () => {
    // Mock database response for gpt-3.5-turbo
    mockPrisma.modelPricing.findUnique.mockResolvedValue({
      inputPrice: "0.001",
      outputPrice: "0.002",
    });

    const res = await countTokensAndCost(
      {
        model: "gpt-3.5-turbo",
        prompt: "hello",
        completion: "world",
      },
      mockPrisma,
    );
    expect(res.promptTokens).toBe(1);
    expect(res.completionTokens).toBe(1);
    expect(res.usd).toBeCloseTo((1 * 0.001 + 1 * 0.002) / 1000, 6);
  });

  it("calculates gpt-4 chat cost", async () => {
    // Mock database response for gpt-4
    mockPrisma.modelPricing.findUnique.mockResolvedValue({
      inputPrice: "0.03",
      outputPrice: "0.06",
    });

    const res = await countTokensAndCost(
      {
        model: "gpt-4",
        prompt: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "world" },
        ],
        completion: "ok",
      },
      mockPrisma,
    );
    // prompt tokens: (4 + 1 + 1) * 2 + 2 = 14
    expect(res.promptTokens).toBe(14);
    const expected = (14 * 0.03 + 1 * 0.06) / 1000;
    expect(res.usd).toBeCloseTo(expected, 6);
  });

  it("handles empty prompt", async () => {
    // Mock database response for gpt-3.5-turbo
    mockPrisma.modelPricing.findUnique.mockResolvedValue({
      inputPrice: "0.001",
      outputPrice: "0.002",
    });

    const res = await countTokensAndCost(
      { model: "gpt-3.5-turbo", prompt: "" },
      mockPrisma,
    );
    expect(res.promptTokens).toBe(0);
    expect(res.usd).toBe(0);
  });

  it("falls back on unknown model", async () => {
    // Mock database to return null (model not found)
    mockPrisma.modelPricing.findUnique.mockResolvedValue(null);

    const res = await countTokensAndCost(
      { model: "unknown", prompt: "hi" },
      mockPrisma,
    );
    expect(res.promptTokens).toBe(1);
    // uses fallback pricing (gpt-3.5 equivalent)
    expect(res.usd).toBeCloseTo(0.001 / 1000, 6);
  });

  it("handles database errors gracefully", async () => {
    // Mock database to throw an error
    mockPrisma.modelPricing.findUnique.mockRejectedValue(
      new Error("Database error"),
    );

    const res = await countTokensAndCost(
      { model: "some-model", prompt: "hi" },
      mockPrisma,
    );
    expect(res.promptTokens).toBe(1);
    // uses fallback pricing when database fails
    expect(res.usd).toBeCloseTo(0.001 / 1000, 6);
  });
});
