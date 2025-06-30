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
worker. Configure a monthly cap with `MAX_MONTHLY_USD`.

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
