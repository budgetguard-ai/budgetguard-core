#!/bin/bash
set -e
POLICY_PATH="${OPA_POLICY_PATH:-src/policy/opa_policy.wasm}"
if [ ! -f "$POLICY_PATH" ]; then
  bash "$(dirname "$0")/build-opa-wasm.sh"
fi
