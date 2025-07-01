#!/bin/bash
set -e
tmp=$(mktemp)
opa build -t wasm -e budgetguard/policy/allow src/policy/opa.rego -o "$tmp"
tmpdir=$(mktemp -d)
tar xzf "$tmp" -C "$tmpdir"
cat "$tmpdir/policy.wasm" > src/policy/opa_policy.wasm
rm -r "$tmpdir" "$tmp"