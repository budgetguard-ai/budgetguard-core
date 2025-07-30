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

## 🚀 Quick Start (10 minutes)

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Git

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/budgetguard-ai/budgetguard-core.git
cd budgetguard-core
npm install
```

### 2. Install OPA (Open Policy Agent)

```bash
# Download and install OPA
export OPA_VERSION=$(curl -s https://api.github.com/repos/open-policy-agent/opa/releases/latest | grep tag_name | cut -d '"' -f 4)
curl -L -o opa https://github.com/open-policy-agent/opa/releases/download/${OPA_VERSION}/opa_linux_amd64_static
chmod +x opa

# Install globally (use sudo if needed, or install to ~/bin and add to PATH)
sudo mv opa /usr/local/bin/opa

# Verify installation
opa version
```

### 3. Configure Environment Variables

```bash
# Copy example environment file
cp .env.example .env
```

**Edit `.env` and set these REQUIRED variables:**

```bash
# API Keys (get these from your provider dashboards)
OPENAI_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
GOOGLE_API_KEY=your-google-api-key-here

# Admin Authentication
ADMIN_API_KEY=your-secure-admin-key-here

# Budget & Rate Limiting (optional - has sensible defaults)
DEFAULT_BUDGET_USD=50
MAX_REQS_PER_MIN=100
```

**For the dashboard, also create environment file:**

```bash
# Create dashboard environment file
cd src/dashboard
cp .env.example .env || echo "VITE_ADMIN_API_KEY=your-secure-admin-key-here" > .env
cd ../..
```

Make sure `VITE_ADMIN_API_KEY` matches your `ADMIN_API_KEY` from the main `.env` file.

### 4. Build Policy Bundle

```bash
bash scripts/build-opa-wasm.sh
```

### 5. Start Database Services

```bash
# Start PostgreSQL and Redis
docker compose up -d postgres redis

# Wait a few seconds for database to be ready
sleep 5
```

### 6. Run Database Migrations & Seed Data

```bash
# Run migrations
npx prisma migrate dev

# Seed with demo data and model pricing
npm run seed
```

### 7. Start the Full Application

```bash
# Start all services (API, Postgres, Redis)
docker compose up --build

# In a separate terminal, start the background worker
npm run worker
```

### 8. Test Your Installation

**Dashboard:** http://localhost:3000/dashboard
**API Docs:** http://localhost:3000/docs

**Create a tenant and API key:**
```bash
# Create a tenant
curl -X POST http://localhost:3000/admin/tenant \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: your-secure-admin-key-here" \
  -d '{"name": "demo", "displayName": "Demo Tenant"}'

# Create an API key (replace "2" with the returned tenant ID)
curl -X POST http://localhost:3000/admin/tenant/2/apikeys \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: your-secure-admin-key-here" \
  -d '{"name": "test-key"}'
```

**Test the gateway:**
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: demo" \
  -H "X-API-Key: returned-api-key-from-above" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello, BudgetGuard!"}]}'
```

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