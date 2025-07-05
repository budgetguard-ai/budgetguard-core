import { describe, it, expect, beforeEach, vi } from "vitest";
import { evaluatePolicy } from "../policy/opa.js";

vi.mock("@open-policy-agent/opa-wasm", () => ({
  default: {
    loadPolicy: async () => ({
      evaluate: (input: Record<string, unknown>) => [
        {
          result:
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Array.isArray((input as any).budgets) &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (input as any).budgets.every(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (b: any) => b.usage < b.budget,
            ) &&
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
      tenant: "t1",
      route: "/v1/completions",
      time: 12,
      budgets: [{ period: "daily", usage: 1, budget: 10, start: "", end: "" }],
    });
    expect(allow).toBe(true);
  });

  it("denies over budget", async () => {
    const allow = await evaluatePolicy({
      tenant: "t1",
      route: "/v1/completions",
      time: 12,
      budgets: [{ period: "daily", usage: 11, budget: 10, start: "", end: "" }],
    });
    expect(allow).toBe(false);
  });

  it("denies admin route after hours", async () => {
    const allow = await evaluatePolicy({
      tenant: "t1",
      route: "/admin/tenant-usage",
      time: 21,
      budgets: [{ period: "daily", usage: 1, budget: 10, start: "", end: "" }],
    });
    expect(allow).toBe(false);
  });
});
