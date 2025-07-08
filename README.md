# BudgetGuard Core

**Stop surprise AI bills. Ship with confidence.**
BudgetGuard is the **FinOps control plane for OpenAI**—a drop‑in API gateway that enforces hard budgets, rate limits, and custom policy checks before any request reaches OpenAI.

---

## Why BudgetGuard?

| Pain                        | How BudgetGuard helps                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Unexpected invoices**     | Hard‑cap monthly or rolling budgets—requests are blocked the moment a tenant would exceed its limit. |
| **Runaway scripts & abuse** | Per‑minute rate limits and customizable OPA/Rego policies catch bad actors instantly.                |
| **FinOps black box**        | Every call is logged to an immutable **UsageLedger** table for audit, chargeback, and forecasting.   |
| **Multi‑tenant SaaS needs** | Quotas, API keys, and budgets are all **tenant‑aware** out of the box.                               |
| **Vendor lock‑in fears**    | Self‑hosted, Docker‑first, and <100 ms of added latency. Keep your infra (and keys) private.         |

---

## Quick Start (5 minutes)

1. **Clone & enter the repo**

   ```bash
   git clone https://github.com/your-org/budgetguard-core.git
   cd budgetguard-core
   ```

2. **Install deps & build the policy bundle**

   ```bash
   npm install
   bash scripts/build-opa-wasm.sh
   ```

3. **Run migrations & seed demo data**

   ```bash
   npx prisma migrate dev
   npm run seed
   ```

4. **Configure secrets**
   Copy `.env.example` ➜ `.env` (or export manually):

   | Variable             | Description                                            |
   | -------------------- | ------------------------------------------------------ |
   | `OPENAI_KEY`         | Your OpenAI API key                                    |
   | `ADMIN_API_KEY`      | Key for admin routes                                   |
   | `MAX_REQS_PER_MIN`   | Per‑tenant rate limit (default **100**)                |
   | `DEFAULT_BUDGET_USD` | Default tenant monthly budget                          |
   | `BUDGET_PERIODS`     | Comma‑separated budget windows (e.g. `monthly,weekly`) |

5. **Boot everything**

   ```bash
   docker compose up --build     # Postgres, Redis, API
   ```

6. **Launch the background worker** (new terminal)

   ```bash
   npm run worker
   ```

7. **Test the gateway**

   * Browse Swagger UI → [http://localhost:3000/docs](http://localhost:3000/docs)
   * Curl a completion:

     ```bash
     curl -X POST http://localhost:3000/v1/completions \
       -H "Content-Type: application/json" \
       -H "X-Tenant-Id: demo" \
       -H "X-API-Key: <TENANT_API_KEY>" \
       -d '{"model":"gpt-3.5-turbo","prompt":"hello"}'
     ```

That’s it—you now have full budget & rate‑limit protection in front of OpenAI.

---

## Running in Production

1. **Set environment variables** (`OPENAI_KEY`, `ADMIN_API_KEY`, `MAX_REQS_PER_MIN`, etc.).
2. **Start Postgres, Redis, and the API**:

   ```bash
   docker compose up --build -d
   ```
3. **Run the worker** in a separate process/container:

   ```bash
   npm run worker
   ```
4. **Monitor**: metrics and structured logs are exposed on `/metrics` and `/health` endpoints.

---

## API Reference

### Proxy Endpoints

| Method | Path                   | Description                        |
| ------ | ---------------------- | ---------------------------------- |
| `POST` | `/v1/completions`      | Forward to OpenAI completions      |
| `POST` | `/v1/chat/completions` | Forward to OpenAI chat completions |
| `GET`  | `/health`              | Liveness probe                     |

Required headers: `X-Tenant-Id`, `X-API-Key` (or rely on server‑side `OPENAI_KEY`). Usage is logged in `UsageLedger`.

### Admin Endpoints (auth via `X-Admin-Key`)

| Method | Path                        | Action           |
| ------ | --------------------------- | ---------------- |
| `POST` | `/admin/tenant`             | Create tenant    |
| `GET`  | `/admin/tenant/:id`         | Tenant info      |
| `POST` | `/admin/tenant/:id/budgets` | Set budgets      |
| `POST` | `/admin/tenant/:id/apikeys` | Generate API key |

Full OpenAPI spec available at **/docs** once the service is running.

---

## Policy Engine

Policies are written in [Rego](https://www.openpolicyagent.org/). Edit `src/policy/opa.rego` and rebuild:

```bash
bash scripts/build-opa-wasm.sh
```

Override the bundle path with `OPA_POLICY_PATH`. Hot‑reloading is enabled in dev mode.

---

## Data Storage

| Component    | Purpose                                             |
| ------------ | --------------------------------------------------- |
| **Postgres** | Tenants, API keys, budgets, immutable `UsageLedger` |
| **Redis**    | Cached budgets & rate‑limit counters (fast path)    |

Migrations (Prisma):

```bash
# local dev
a npx prisma migrate dev

# production
npm run migrate
```

---

## Roadmap

* 🔜 **Stripe cost back‑filling** for end‑to‑end showback
* 🔜 **Email / Slack budget alerts**
* 🔜 **Plug‑ins for Anthropic, Mistral, Google AI, etc.**

---

## Contributing

1. Fork & create a feature branch.
2. Ensure `npm run test` passes.
3. Open a PR—CI will lint, type‑check, and run the integration suite.

We follow the Contributor Covenant code of conduct.

---

## License

Apache License 2.0. See `LICENSE`.

---

> **BudgetGuard Core** — because your OpenAI bill shouldn’t keep you up at night.
> Give us a ⭐ if this saved you one!
