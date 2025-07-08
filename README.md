# BudgetGuard Core

BudgetGuard is an API gateway that meters OpenAI usage by tenant. It applies rate limits, budgets and policy checks before forwarding requests.

## One-Time Setup

1. Install dependencies and build the policy bundle:
   ```bash
   npm install
   bash scripts/build-opa-wasm.sh
   ```
2. Run initial migrations and seed the database:
   ```bash
   npx prisma migrate dev
   npm run seed
   ```

## Starting the Service

1. Set required environment variables:
   - `OPENAI_KEY` – OpenAI API key
   - `ADMIN_API_KEY` – key for admin routes
   - `MAX_REQS_PER_MIN` – per-tenant rate limit (default `100`)
   - `DEFAULT_BUDGET_USD` – default monthly budget
   - `BUDGET_PERIODS` – comma separated budget windows

   Keep secrets out of source control.

2. Launch Postgres, Redis and the API:
   ```bash
   docker compose up --build
   ```
3. In another terminal run the worker:
   ```bash
   npm run worker
   ```

View the Swagger UI at [http://localhost:3000/docs](http://localhost:3000/docs).

## API Overview

### Proxy Endpoints

- `POST /v1/completions`
- `POST /v1/chat/completions`
- `GET  /health`

Include `X-Tenant-Id` and `OpenAI-Key` (or set `OPENAI_KEY`). Usage is recorded in the `UsageLedger` table.

Example requests:

```bash
curl -X POST http://localhost:3000/v1/completions \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: demo" \
  -H "X-API-Key: <TENANT_API_KEY>" \
  -d '{"model":"gpt-3.5-turbo","prompt":"hello"}'

curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: demo" \
  -H "X-API-Key: <TENANT_API_KEY>" \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"hi"}]}'
```

### Admin Endpoints

Use `X-Admin-Key` for authentication.

- `POST /admin/tenant` – create tenant
- `GET  /admin/tenant/:id` – tenant info
- `POST /admin/tenant/:id/budgets` – set budgets
- `POST /admin/tenant/:id/apikeys` – generate API key

See `/docs` for the full specification.

## Policy

Policies are written in [Rego](https://www.openpolicyagent.org/). Edit `src/policy/opa.rego` and rebuild when it changes:

```bash
bash scripts/build-opa-wasm.sh
```

Override the compiled path with `OPA_POLICY_PATH`. The server reloads the file on change.

## Database

Migrations use Prisma. Apply migrations locally with:

```bash
npx prisma migrate dev
```

Deploy migrations in production with:

```bash
npm run migrate
```

Budgets and usage are stored in Postgres and cached in Redis.
