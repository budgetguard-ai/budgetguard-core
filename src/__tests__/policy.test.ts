import { describe, it, expect, beforeEach } from "vitest";
import { evaluatePolicy } from "../policy/opa.js";
import { execSync } from "child_process";

beforeEach(async () => {
  // rebuild wasm before tests to ensure up to date
  execSync("bash scripts/build-opa-wasm.sh");
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
