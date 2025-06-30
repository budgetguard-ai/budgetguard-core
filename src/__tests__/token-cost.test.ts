import { describe, it, expect } from "vitest";
import { countTokensAndCost } from "../token";

describe("token + cost", () => {
  it("calculates gpt-3.5 completion cost", () => {
    const res = countTokensAndCost({
      model: "gpt-3.5-turbo",
      prompt: "hello",
      completion: "world",
    });
    expect(res.promptTokens).toBe(1);
    expect(res.completionTokens).toBe(1);
    expect(res.usd).toBeCloseTo((1 * 0.001 + 1 * 0.002) / 1000, 6);
  });

  it("calculates gpt-4 chat cost", () => {
    const res = countTokensAndCost({
      model: "gpt-4",
      prompt: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "world" },
      ],
      completion: "ok",
    });
    // prompt tokens: (4 + 1 + 1) * 2 + 2 = 14
    expect(res.promptTokens).toBe(14);
    const expected = (14 * 0.03 + 1 * 0.06) / 1000;
    expect(res.usd).toBeCloseTo(expected, 6);
  });

  it("handles empty prompt", () => {
    const res = countTokensAndCost({ model: "gpt-3.5-turbo", prompt: "" });
    expect(res.promptTokens).toBe(0);
    expect(res.usd).toBe(0);
  });

  it("falls back on unknown model", () => {
    const res = countTokensAndCost({ model: "unknown", prompt: "hi" });
    expect(res.promptTokens).toBe(1);
    // uses gpt-3.5 pricing
    expect(res.usd).toBeCloseTo(0.001 / 1000, 6);
  });
});
