import { describe, it, expect, beforeEach, vi } from "vitest";
import { evaluatePolicy } from "../policy/opa.js";

vi.mock("@open-policy-agent/opa-wasm", () => ({
  default: {
    loadPolicy: async () => ({
      evaluate: (input: Record<string, number | string>) => [
        {
          result:
            (input.usage as number) < (input.budget as number) &&
            !(
              input.route === "/admin/tenant-usage" &&
              (input.time as number) > 20
            ),
        },
      ],
    }),
  },
}));

beforeEach(async () => {
  // no setup needed with mocked opa wasm
});

describe("policy evaluation", () => {
  it("allows under budget", async () => {
    const allow = await evaluatePolicy({
      usage: 1,
      budget: 10,
      route: "/v1/completions",
      time: 12,
      tenant: "t1",
    });
    expect(allow).toBe(true);
  });

  it("denies over budget", async () => {
    const allow = await evaluatePolicy({
      usage: 11,
      budget: 10,
      route: "/v1/completions",
      time: 12,
      tenant: "t1",
    });
    expect(allow).toBe(false);
  });

  it("denies admin route after hours", async () => {
    const allow = await evaluatePolicy({
      usage: 1,
      budget: 10,
      route: "/admin/tenant-usage",
      time: 21,
      tenant: "t1",
    });
    expect(allow).toBe(false);
  });
});
