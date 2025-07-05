import { readFile } from "fs/promises";
import opaWasm from "@open-policy-agent/opa-wasm";

interface OpaPolicy {
  evaluate(input: Record<string, unknown>): Promise<Array<{ result: unknown }>>;
}

let policy: OpaPolicy | undefined;
const POLICY_PATH = process.env.OPA_POLICY_PATH || "src/policy/opa_policy.wasm";

async function load() {
  const wasm = await readFile(POLICY_PATH);
  const { loadPolicy } = opaWasm;
  policy = (await loadPolicy(wasm)) as OpaPolicy;
}

export async function evaluatePolicy(
  input: Record<string, unknown>,
): Promise<boolean> {
  if (!policy) {
    await load();
  }
  if (!policy) return false;
  if (!Array.isArray((input as Record<string, unknown>).budgets)) {
    throw new Error("input.budgets must be an array");
  }
  const res = await policy.evaluate(input);
  if (!Array.isArray(res) || res.length === 0) return false;
  const result = res[0].result;
  return Boolean(result);
}
