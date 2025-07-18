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
      inputPrice: "1",
      outputPrice: "2",
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
    expect(res.usd).toBeCloseTo((1 * 1 + 1 * 2) / 1000000, 6);
  });

  it("calculates gpt-4 chat cost", async () => {
    // Mock database response for gpt-4
    mockPrisma.modelPricing.findUnique.mockResolvedValue({
      inputPrice: "30",
      outputPrice: "60",
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
    const expected = (14 * 30 + 1 * 60) / 1000000;
    expect(res.usd).toBeCloseTo(expected, 6);
  });

  it("handles empty prompt", async () => {
    // Mock database response for gpt-3.5-turbo
    mockPrisma.modelPricing.findUnique.mockResolvedValue({
      inputPrice: "1",
      outputPrice: "2",
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
    expect(res.usd).toBeCloseTo(1 / 1000000, 6);
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
    expect(res.usd).toBeCloseTo(1 / 1000000, 6);
  });
});
