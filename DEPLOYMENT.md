# Production Deployment

BudgetGuard components: API Gateway, Background Worker, PostgreSQL, Redis, Dashboard (optional).

## Docker Deployment (Recommended)

```bash
git clone https://github.com/budgetguard-ai/budgetguard-core.git
cd budgetguard-core

# Setup
npm install && npm run setup

# Configure environment
cp .env.example .env
# Edit .env with your production values

# Start
docker compose up --build -d
npm run worker  # In separate process
```

## Environment Variables

**Main `.env`:**
```bash
DATABASE_URL=postgres://user:password@host:5432/budgetguard
REDIS_URL=redis://host:6379

OPENAI_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

ADMIN_API_KEY=your-secure-admin-key
MAX_REQS_PER_MIN=100
DEFAULT_BUDGET_USD=50
```

**Dashboard (`src/dashboard/.env`):**
```bash
VITE_ADMIN_API_KEY=your-secure-admin-key  # Must match above
VITE_API_BASE_URL=https://your-domain.com  # For remote deployments
```

## Fly.io Deployment

```bash
# Setup
brew install flyctl  # or curl -L https://fly.io/install.sh | sh
fly auth login
fly launch --copy-config --name your-app-name

# Configure
cp fly.toml.example fly.toml
# Edit fly.toml with your app name and URLs

# Set secrets
fly secrets set ADMIN_API_KEY="$(openssl rand -hex 32)"
fly secrets set OPENAI_KEY="sk-..."

# Deploy
fly deploy
```

**For best performance, use external databases:**
```bash
fly postgres create --name budgetguard-db
fly redis create --name budgetguard-redis
fly secrets set DATABASE_URL="postgres://..."
fly secrets set REDIS_URL="redis://..."
```

## Health & Monitoring

- `GET /health` - Basic health check
- `GET /health/detailed` - Database and Redis status
- Check logs: `docker logs budgetguard-api`

## Database Management

```bash
# Migrations
npm run migrate

# Backup
pg_dump $DATABASE_URL > backup.sql

# Performance indexes (adjust field names to match your schema)
CREATE INDEX CONCURRENTLY idx_usage_ledger_tenant_created ON "UsageLedger"(tenant, created_at);
```

## Troubleshooting

**Common issues:**
- **OPA not found**: Setup script should install automatically
- **Dashboard connection refused**: Check `ADMIN_API_KEY` matches in both `.env` files
- **Database errors**: Start DB services first, then run migrations
- **High memory usage**: Set `NODE_OPTIONS="--max-old-space-size=4096"`

**Logs:**
```bash
docker logs budgetguard-api --tail 100 -f
docker logs budgetguard-worker --tail 100 -f
```

## Deployment Checklist

**Pre-deployment:**
- [ ] Environment variables configured
- [ ] SSL certificates ready
- [ ] Database backups scheduled

**Deployment:**
- [ ] Database services started first
- [ ] Migrations applied
- [ ] API and worker deployed
- [ ] Health checks passing
- [ ] Dashboard accessible

**Post-deployment:**
- [ ] End-to-end testing
- [ ] Monitoring configured
- [ ] Team notified