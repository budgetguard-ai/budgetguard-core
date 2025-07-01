# budgetguard-core

## Rate-Limiting

The server applies a per-tenant sliding window limiter. Configure the maximum
number of requests per minute with the `MAX_REQS_PER_MIN` environment variable
(defaults to `100`). Identify tenants by sending an `X-Tenant-Id` header with
your requests.

## Quick Start

Run the stack with Postgres and Redis using Docker:

```bash
docker compose up --build
```

## Proxy Endpoints

BudgetGuard forwards OpenAI requests and logs usage locally. Set `OPENAI_KEY` in
your environment or send `X-OpenAI-Key` per request.

```
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: demo" \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"hi"}]}' \
  http://localhost:3000/v1/chat/completions
```

Responses are proxied back and an entry is written to the `UsageLedger` table:

```
ts | tenant | route | usd | promptTok | compTok
```

## Cost Calculation

BudgetGuard counts tokens using `tiktoken` and multiplies by the per-model
OpenAI pricing. The default table:

| Model          | Prompt / 1K | Completion / 1K |
|---------------|-------------|-----------------|
| gpt-3.5-turbo | $0.001       | $0.002          |
| gpt-4         | $0.03        | $0.06           |
| gpt-4-turbo   | $0.01        | $0.03           |

The total USD for a request is stored in Redis and persisted to Postgres by the
worker. Configure a monthly cap with `MAX_MONTHLY_USD` or use `BUDGET_PERIODS`
to enforce daily, weekly, monthly, or custom windows simultaneously.

## Budget

Set `DEFAULT_BUDGET_USD` to limit spend for all tenants. Provide one or more
periods via `BUDGET_PERIODS` (e.g. `daily,monthly`) and specify budgets for each
with variables like `BUDGET_DAILY_USD` or `BUDGET_MONTHLY_USD`. For custom
ranges also supply `BUDGET_START_DATE` and `BUDGET_END_DATE`. Override tenants
with `BUDGET_<PERIOD>_<TENANT>` variables. When a request would exceed any
budget, the server responds with:

```json
HTTP/1.1 402 Payment Required
{"error":"Budget exceeded"}
```

### Example

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: demo" \
  -d '{"model":"gpt-3.5-turbo","prompt":"hello"}' \
  http://localhost:3000/v1/completions
```

### Example Request

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: demo" \
  -d '{"model":"gpt-3.5-turbo","prompt":"hello"}' \
  http://localhost:3000/v1/completions
```

After a request is processed, the worker inserts a row into `UsageLedger`:

```
id | ts | tenant | route | usd | promptTok | compTok
```

## Policy Engine

BudgetGuard uses [Open Policy Agent](https://www.openpolicyagent.org/) to make
allow/deny decisions before forwarding requests. Policies are compiled to WASM
and evaluated at runtime. The default policy is located in
`src/policy/opa.rego` and can be extended to enforce custom rules.

### Building the Policy

Install the `opa` CLI and run the build script whenever the policy changes or
before starting the server/tests. On macOS you can install OPA via Homebrew:

```bash
brew install opa
```

For Linux and Windows, download the appropriate binary from the
[OPA releases](https://openpolicyagent.org/docs/latest/#install) page and place
it in your `PATH`. See the [official installation guide](https://openpolicyagent.org/docs/latest/#install)
for more details.

Once the CLI is installed, run the build script:

```bash
bash scripts/build-opa-wasm.sh
```

This compiles the policy to `src/policy/opa_policy.wasm` which the server loads
on startup. Run the script once before starting the server or running tests so
the WASM file is present. Set `OPA_POLICY_PATH` to override the location.

### Example Rego Policy

```rego
package budgetguard.policy

default allow = false

allow {
  input.usage < input.budget
}

deny_admin_after_hours {
  input.route == "/admin/tenant-usage"
  input.time > 20
}

allow {
  not deny_admin_after_hours
}
```

The policy receives an input object with `usage`, `budget`, `route`, `time`, and
`tenant` fields. If evaluation returns `true`, the request is allowed. Otherwise
the server responds with `403` and an error message.
