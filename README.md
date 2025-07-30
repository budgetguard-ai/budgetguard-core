<div align="center">

# <img src="src/dashboard/src/assets/logo.png" alt="BudgetGuard" width="48" height="48"> BudgetGuard

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

**Stop surprise AI bills. Ship with confidence.**

A **lightning-fast FinOps control plane for AI APIs**—a drop‑in API gateway that enforces hard budgets, rate limits, and custom policy checks before any request reaches LLM providers.

</div>

## ✨ Key Features

- 🛡️ **Hard Budget Enforcement** - Requests blocked the moment a tenant would exceed their limit
- ⚡ **Rate Limiting** - Per-minute rate limits with tenant-aware controls  
- 🏢 **Multi-tenant Ready** - Quotas, API keys, and budgets are tenant-scoped out of the box
- 📊 **Complete Audit Trail** - Every call logged to immutable UsageLedger for audit and chargeback
- 🔧 **Policy Engine** - Customizable OPA/Rego policies for advanced request filtering
- 🌐 **Multi-provider Support** - OpenAI, Anthropic Claude, Google Gemini APIs
- 🐳 **Self-hosted** - Docker-first deployment, keep your infrastructure and keys private
- ⚡ **Low Latency** - ~10-15ms added latency to your AI API calls
- 📈 **Usage Analytics** - Built-in dashboard for monitoring and cost management
- 🎨 **Modern Dashboard** - React-based UI with Material Design 3, light/dark themes

---

## Why BudgetGuard?

| Pain                        | How BudgetGuard helps                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Unexpected invoices**     | Hard‑cap monthly or rolling budgets—requests are blocked the moment a tenant would exceed its limit. |
| **Runaway scripts & abuse** | Per‑minute rate limits and customizable OPA/Rego policies catch bad actors instantly.                |
| **FinOps black box**        | Every call is logged to an immutable **UsageLedger** table for audit, chargeback, and forecasting.   |
| **Multi‑tenant SaaS needs** | Quotas, API keys, and budgets are all **tenant‑aware** out of the box.                               |
| **Vendor lock‑in fears**    | Self‑hosted, Docker‑first, and ~10-15ms of added latency. Keep your infra (and keys) private.         |

---

## 🚀 Quick Start (2 minutes)

### One-Command Setup
```bash
git clone https://github.com/budgetguard-ai/budgetguard-core.git
cd budgetguard-core
npm install && npm run setup
```

### Add Your API Keys
Edit the `.env` file that was created:
```bash
# Required - get this from your AI provider dashboard
OPENAI_KEY=sk-your-openai-key-here

ADMIN_API_KEY=your-secure-admin-key-here  # any secure string

# Optional - for other providers
ANTHROPIC_API_KEY=sk-ant-your-key
GOOGLE_API_KEY=your-google-key
```

### Start & Test
```bash
# Start everything
npm run dev

# In another terminal - test with a real AI call
npm run demo
```

**Success indicators:**
- ✅ Dashboard loads at http://localhost:3000/dashboard  
- ✅ Demo shows an AI request being tracked
- ✅ Budget shows $0.02 usage

**Note:** The setup script automatically creates `src/dashboard/.env` with the required `VITE_ADMIN_API_KEY` and `VITE_API_BASE_URL` variables.

### Next Steps
- [Create your first tenant](#tenant-management) 
- [Set custom budgets](#budget-management)  
- [Deploy to production](DEPLOYMENT.md)

## ✅ Verify It's Working

After setup, you should see:

1. **Dashboard loads** → http://localhost:3000/dashboard
   - Shows system health as "green"
   - Shows demo tenant with $0.00 usage

2. **Demo request works** → `npm run demo` 
   - Creates a tenant
   - Makes an AI call  
   - Shows ~$0.02 usage in dashboard

3. **Budget enforcement works** → Try exceeding the $50 default budget
   - Requests get blocked with "Budget exceeded" error
   - Dashboard shows red warning

**If something's not working:**
- Check `docker logs budgetguard-api` for errors
- Verify your `.env` file has valid API keys
- Run `curl http://localhost:3000/health` to check server status

## 🔧 Common Issues

### "OPA command not found"
```bash
# The setup script should handle this, but if it fails:
curl -L -o opa https://github.com/open-policy-agent/opa/releases/latest/download/opa_linux_amd64_static
chmod +x opa && sudo mv opa /usr/local/bin/opa
```

### "Dashboard shows connection refused"  
```bash
# Check your admin key matches in both files:
grep ADMIN_API_KEY .env
grep VITE_ADMIN_API_KEY src/dashboard/.env
# They should be the same
```

### "Database connection failed"
```bash
# Restart the database
docker compose down
docker compose up -d postgres redis
sleep 5
npx prisma migrate dev
```

### "Invalid API key" errors
- Make sure your OpenAI/Anthropic keys are valid
- Check the keys don't have extra spaces or quotes
- Try the keys directly with the provider APIs first

---

## 🎛️ Management Dashboard

BudgetGuard includes a modern React dashboard for easy management and monitoring:

### Features
- **System Overview** - Real-time health monitoring for database, Redis, and AI providers
- **Tenant Management** - Create, edit, and manage tenants with budget controls
- **Usage Analytics** - Track spending, request patterns, and model usage
- **Budget Management** - Set and monitor budgets across different time periods
- **API Key Management** - Generate and manage tenant API keys
- **Material Design 3** - Modern, responsive UI with light/dark theme support

### Access the Dashboard

Once your server is running, visit: **http://localhost:3000/dashboard**

![BudgetGuard Dashboard](docs/images/dashboard-overview.png)

*More screenshots and detailed dashboard documentation: [src/dashboard/README.md](src/dashboard/README.md)*

---

## 🔧 Troubleshooting

### Common Issues

**"OPA command not found"**
- Make sure you completed step 2 (Install OPA)
- Verify with `opa version`

**"Dashboard shows connection refused"**  
- Ensure `VITE_ADMIN_API_KEY` is set in `src/dashboard/.env`
- Make sure it matches your main `ADMIN_API_KEY`
- Rebuild: `docker compose down && docker compose up --build`

**"Database connection failed"**
- Start database first: `docker compose up -d postgres redis`
- Wait a few seconds before running migrations

**"Worker fails with TypeScript error"**
- Install tsx: `npm install -g tsx`
- Run with: `tsx src/worker.ts`

---

## Running in Production

1. **Set environment variables** (see [DEPLOYMENT.md](DEPLOYMENT.md) for complete guide)
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
| `POST` | `/v1/chat/completions` | Forward to AI provider chat completions |
| `POST` | `/v1/responses`        | Forward to AI provider responses   |
| `GET`  | `/health`              | Liveness probe                     |

Required headers: `X-Tenant-Id`, `X-API-Key`. Usage is logged in `UsageLedger`.

### Admin Endpoints (auth via `X-Admin-Key`)

| Method | Path                        | Action           |
| ------ | --------------------------- | ---------------- |
| `POST` | `/admin/tenant`             | Create tenant    |
| `GET`  | `/admin/tenant/:id`         | Tenant info      |
| `POST` | `/admin/tenant/:id/budgets` | Set budgets      |
| `POST` | `/admin/tenant/:id/apikeys` | Generate API key |
| `PUT`  | `/admin/tenant/:id/ratelimit` | Set per-minute rate limit (0=unlimited) |
| `GET`  | `/admin/tenant/:id/ratelimit` | Get per-minute rate limit |

`rateLimitPerMin` set to `0` disables limiting for that tenant.

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
| **Postgres** | Tenants, API keys, budgets, immutable `UsageLedger`, model pricing |
| **Redis**    | Cached budgets & rate‑limit counters (fast path)    |

Migrations (Prisma):

```bash
# local dev
npx prisma migrate dev

# production
npm run migrate
```

---

## Roadmap

* ✅ **Multi-provider support** (OpenAI, Anthropic, Google)
* 🔜 **Real-Time Budget Alerts**
* 🔜 **Additional providers** (Mistral, xAI, etc.)
* 🔜 **Advanced Analytics & Reporting**
* 🔜 **Feature-Level Budget Controls** 

---

## 📚 Documentation

- [**Dashboard Guide**](src/dashboard/README.md) - Management dashboard setup and features
- [**API Reference**](docs/api.md) - Complete API documentation with examples
- [**Architecture Overview**](docs/ARCHITECTURE.md) - System design and data flow
- [**Deployment Guide**](DEPLOYMENT.md) - Production deployment instructions
- [**Contributing Guide**](CONTRIBUTING.md) - How to contribute to the project

## Contributing

1. Fork & create a feature branch
2. Ensure `npm run test` passes
3. Open a PR—CI will lint, type‑check, and run the integration suite

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines. We follow the Contributor Covenant code of conduct.

---

## License

Apache License 2.0. See `LICENSE`.

---

<div align="center">

**BudgetGuard** — because your AI bills shouldn't keep you up at night.

⭐ Star the repo to get updates and help shape the future of BudgetGuard!

[Documentation](docs/) • [API Reference](docs/api.md) • [Contributing](CONTRIBUTING.md)

</div>