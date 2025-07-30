# Production Deployment Guide

This guide covers deploying BudgetGuard in production environments.

## 🏗️ Architecture Overview

BudgetGuard consists of several components:
- **API Gateway** - Main Fastify server handling AI requests
- **Background Worker** - Processes usage events and maintains ledger
- **PostgreSQL** - Primary data storage
- **Redis** - Caching and rate limiting
- **Dashboard** - React-based management UI (optional)

## 🐳 Docker Deployment (Recommended)

### Quick Start with Docker Compose

1. **Clone the repository**
   ```bash
   git clone https://github.com/budgetguard-ai/budgetguard-core.git
   cd budgetguard-core
   ```

2. **Install OPA (Open Policy Agent)**
   ```bash
   # Download and install OPA
   export OPA_VERSION=$(curl -s https://api.github.com/repos/open-policy-agent/opa/releases/latest | grep tag_name | cut -d '"' -f 4)
   curl -L -o opa https://github.com/open-policy-agent/opa/releases/download/${OPA_VERSION}/opa_linux_amd64_static
   chmod +x opa
   sudo mv opa /usr/local/bin/opa
   
   # Build policy bundle
   bash scripts/build-opa-wasm.sh
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your production values
   ```

4. **Configure dashboard environment**
   ```bash
   cd src/dashboard
   echo "VITE_ADMIN_API_KEY=your-secure-admin-key-here" > .env
   cd ../..
   ```

5. **Start database services first**
   ```bash
   docker compose up -d postgres redis
   sleep 5  # Wait for database to be ready
   ```

6. **Run database migrations and seed data**
   ```bash
   npx prisma migrate dev
   npm run seed
   ```

7. **Build and start all services**
   ```bash
   docker compose up --build -d
   ```

8. **Start the background worker**
   ```bash
   npm run worker
   ```

### Production Docker Compose

Create a `docker-compose.prod.yml` for production:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: budgetguard
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  api:
    build: .
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://postgres:${DB_PASSWORD}@postgres:5432/budgetguard
      REDIS_URL: redis://redis:6379
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    env_file:
      - .env

  worker:
    build: .
    command: npm run worker
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://postgres:${DB_PASSWORD}@postgres:5432/budgetguard
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    env_file:
      - .env

volumes:
  postgres_data:
  redis_data:
```

## 🔧 Environment Configuration

### Required Environment Variables

**Main `.env` file:**
```bash
# Database
DATABASE_URL=postgres://user:password@host:5432/budgetguard
REDIS_URL=redis://host:6379

# AI Provider API Keys
OPENAI_KEY=sk-...                    # For GPT models
ANTHROPIC_API_KEY=sk-ant-...         # For Claude models
GOOGLE_API_KEY=...                   # For Gemini models

# Security
ADMIN_API_KEY=your-secure-admin-key  # Admin API access

# Rate Limiting & Budgets
MAX_REQS_PER_MIN=100                 # Default rate limit (0 = unlimited)
DEFAULT_BUDGET_USD=50                # Default monthly budget
BUDGET_PERIODS=daily,monthly         # Budget periods to track

# Optional
NODE_ENV=production
OPA_POLICY_PATH=src/policy/opa_policy.wasm
DEFAULT_TENANT=public
```

**Dashboard environment file (`src/dashboard/.env`):**
```bash
# Dashboard Configuration (CRITICAL - dashboard won't work without this!)
VITE_ADMIN_API_KEY=your-secure-admin-key  # Must match ADMIN_API_KEY above

# For remote deployments, set the API base URL
VITE_API_BASE_URL=https://your-domain.com
```

### Security Best Practices

1. **Use strong passwords and keys**
   ```bash
   # Generate secure random keys
   openssl rand -hex 32  # For ADMIN_API_KEY
   ```

2. **Restrict database access**
   - Use dedicated database user with minimal permissions
   - Enable SSL connections
   - Configure firewall rules

3. **Secure Redis**
   - Enable authentication if exposed
   - Use private networks
   - Consider Redis ACLs

## ✈️ Fly.io Deployment

### Quick Start with Fly.io

1. **Install Fly CLI**
   ```bash
   # macOS
   brew install flyctl
   
   # Linux/Windows
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login and setup**
   ```bash
   fly auth login
   fly launch --copy-config --name your-app-name
   ```

3. **Configure your app**
   ```bash
   # Copy example configuration
   cp fly.toml.example fly.toml
   
   # Edit fly.toml with your app details:
   # - app = 'your-app-name'
   # - VITE_API_BASE_URL = "https://your-app-name.fly.dev"
   # - VITE_ADMIN_API_KEY = "your-admin-api-key"
   ```

4. **Set secrets**
   ```bash
   # Generate secure admin key
   fly secrets set ADMIN_API_KEY="$(openssl rand -hex 32)"
   fly secrets set VITE_ADMIN_API_KEY="$(fly secrets list | grep ADMIN_API_KEY | awk '{print $2}')"
   
   # Add AI provider keys
   fly secrets set OPENAI_KEY="sk-..."
   fly secrets set ANTHROPIC_API_KEY="sk-ant-..."
   fly secrets set GOOGLE_API_KEY="..."
   ```

5. **Deploy**
   ```bash
   fly deploy
   ```

### Deployment Options

**Option 1: External Fly Databases (RECOMMENDED)**
- **Best performance**: ~10ms policy decisions with optimized caching
- **True persistence**: Data survives all deployments
- **Production-ready**: Managed services with backups
- **Lower resource usage**: App gets full CPU/memory

```bash
# 1. Create databases in same region
fly postgres create --name budgetguard-db --region your-region
fly redis create --name budgetguard-redis --region your-region

# 2. Set connection secrets (use URLs from create output)
fly secrets set DATABASE_URL="postgres://user:pass@budgetguard-db.flycast:5432/budgetguard"
fly secrets set REDIS_URL="redis://default:pass@budgetguard-redis.flycast:6379"
```

**Option 2: All-in-One Container (Simple)**
- Uses included Dockerfile with PostgreSQL + Redis in same container
- Same policy decision performance (~10ms) with resource contention
- Good for development/testing, external databases recommended for production

### Fly.io Configuration

The `fly.toml` file configures your deployment:

```toml
app = 'your-app-name'
primary_region = 'iad'  # Choose your preferred region

[build]
  [build.args]
    # Required for dashboard to work in production
    VITE_API_BASE_URL = "https://your-app-name.fly.dev"
    VITE_ADMIN_API_KEY = "your-admin-key-here"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = 'stop'
  auto_start_machines = true

[[vm]]
  size = 'performance-2x'
  memory = '8gb'  # Increase if using all-in-one setup
  cpu_kind = 'performance'
  cpus = 2
```

### Fly.io Features Used

- **Automatic HTTPS**: Fly.io handles SSL certificates
- **Built-in PostgreSQL/Redis**: All services run in a single container (if using all-in-one)
- **Auto-scaling**: Machines start/stop based on traffic
- **Health checks**: Built-in health monitoring
- **Zero-downtime deploys**: Rolling updates automatically

### Monitoring on Fly.io

```bash
# View logs
fly logs

# Check app status
fly status

# Monitor metrics
fly dashboard

# Scale your app
fly scale count 2
fly scale memory 4gb
```

### Custom Domains on Fly.io

```bash
# Add custom domain
fly certs add yourdomain.com

# Check certificate status
fly certs show yourdomain.com
```

## ☸️ Kubernetes Deployment

### ConfigMap and Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: budgetguard-secrets
type: Opaque
stringData:
  OPENAI_KEY: sk-...
  ANTHROPIC_API_KEY: sk-ant-...
  GOOGLE_API_KEY: ...
  ADMIN_API_KEY: your-secure-admin-key
  VITE_ADMIN_API_KEY: your-secure-admin-key
  DB_PASSWORD: your-db-password

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: budgetguard-config
data:
  DATABASE_URL: postgres://postgres:password@postgres:5432/budgetguard
  REDIS_URL: redis://redis:6379
  MAX_REQS_PER_MIN: "100"
  DEFAULT_BUDGET_USD: "50"
  BUDGET_PERIODS: daily,monthly
  NODE_ENV: production
```

### Deployment Manifests

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: budgetguard-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: budgetguard-api
  template:
    metadata:
      labels:
        app: budgetguard-api
    spec:
      containers:
      - name: api
        image: budgetguard/core:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: budgetguard-config
        - secretRef:
            name: budgetguard-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: budgetguard-worker
spec:
  replicas: 2
  selector:
    matchLabels:
      app: budgetguard-worker
  template:
    metadata:
      labels:
        app: budgetguard-worker
    spec:
      containers:
      - name: worker
        image: budgetguard/core:latest
        command: ["npm", "run", "worker"]
        envFrom:
        - configMapRef:
            name: budgetguard-config
        - secretRef:
            name: budgetguard-secrets
```

## 🔍 Health Checks & Monitoring

### Health Endpoints

- `GET /health` - Basic health check
- `GET /health/detailed` - Includes database and Redis status

### Monitoring Setup

1. **Prometheus Metrics** (coming soon)
   ```yaml
   # Add to docker-compose.yml
   prometheus:
     image: prom/prometheus
     ports:
       - "9090:9090"
   ```

2. **Log Aggregation**
   ```bash
   # Example with ELK stack
   docker logs budgetguard-api | logstash
   ```

3. **Alerting**
   - Budget threshold alerts
   - High error rates
   - Service unavailability

## 📊 Database Management

### Migrations

```bash
# Production migration
npm run migrate

# Check migration status
npx prisma migrate status

# Reset database (⚠️ DESTRUCTIVE)
npx prisma migrate reset --force
```

### Backup Strategy

```bash
# PostgreSQL backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Automated backups with cron
0 2 * * * pg_dump $DATABASE_URL | gzip > /backups/budgetguard_$(date +\%Y\%m\%d).sql.gz
```

### Performance Tuning

```sql
-- Useful indexes for performance
CREATE INDEX CONCURRENTLY idx_usage_ledger_tenant_created 
ON "UsageLedger"(tenant_id, created_at);

CREATE INDEX CONCURRENTLY idx_budget_tenant_period 
ON "Budget"(tenant_id, period);
```

## 🚀 Scaling Considerations

### Horizontal Scaling

1. **API Servers**: Stateless, can scale horizontally
2. **Workers**: Scale based on Redis queue length
3. **Database**: Consider read replicas for heavy workloads
4. **Redis**: Use Redis Cluster for high availability

### Load Balancing

```nginx
# Example Nginx configuration
upstream budgetguard_api {
    server api1:3000;
    server api2:3000;
    server api3:3000;
}

server {
    listen 80;
    location / {
        proxy_pass http://budgetguard_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🔐 SSL/TLS Configuration

### Using Let's Encrypt with Nginx

```bash
# Install certbot
apt-get install certbot python3-certbot-nginx

# Obtain certificate
certbot --nginx -d yourdomain.com

# Auto-renewal
crontab -e
0 12 * * * /usr/bin/certbot renew --quiet
```

### SSL Termination at Load Balancer

```yaml
# Example with AWS ALB
Resources:
  LoadBalancer:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Scheme: internet-facing
      SecurityGroups: [!Ref SecurityGroup]
      Subnets: [subnet-1, subnet-2]
      
  Listener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties:
      LoadBalancerArn: !Ref LoadBalancer
      Port: 443
      Protocol: HTTPS
      Certificates:
        - CertificateArn: !Ref SSLCertificate
```

## 📈 Performance Optimization

### Multi-Layer Caching Architecture

BudgetGuard uses aggressive caching to achieve sub-10ms policy decisions:

- **API Key Cache**: In-memory (5min TTL) - avoids expensive bcrypt operations
- **Tenant Cache**: Redis (1hr TTL) - eliminates database queries during decisions
- **Budget Cache**: Redis with period-appropriate TTLs (5min-1hr)
- **Rate Limit Cache**: In-memory (1min TTL) - prevents expensive DB lookups
- **Ultra-batched Redis**: Single `mGet` call for all cache reads

**Performance Results:**
- First-time authentication: ~280ms (bcrypt security maintained)
- Cached authentication: ~10ms (96% improvement)
- Policy decisions: 10-30ms total

### Redis Configuration

```redis
# redis.conf optimizations
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### PostgreSQL Tuning

```postgresql
# postgresql.conf optimizations
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
```

## 🛠️ Troubleshooting

### Common Issues

1. **"OPA command not found"**
   ```bash
   # Install OPA first
   export OPA_VERSION=$(curl -s https://api.github.com/repos/open-policy-agent/opa/releases/latest | grep tag_name | cut -d '"' -f 4)
   curl -L -o opa https://github.com/open-policy-agent/opa/releases/download/${OPA_VERSION}/opa_linux_amd64_static
   chmod +x opa && sudo mv opa /usr/local/bin/opa
   ```

2. **"Dashboard shows connection refused"**
   ```bash
   # Ensure VITE_ADMIN_API_KEY is set in src/dashboard/.env
   echo "VITE_ADMIN_API_KEY=your-admin-key" > src/dashboard/.env
   
   # Rebuild dashboard
   cd src/dashboard && npm run build && cd ../..
   docker compose up --build
   ```

3. **High Memory Usage**
   ```bash
   # Check memory usage
   docker stats
   
   # Adjust Node.js memory limits
   NODE_OPTIONS="--max-old-space-size=4096"
   ```

4. **Database Connection Errors**
   ```bash
   # Check connection pool settings
   DATABASE_URL="postgres://user:pass@host:5432/db?pool_timeout=0&connection_limit=10"
   ```

5. **Redis Connection Issues**
   ```bash
   # Test Redis connectivity
   redis-cli -h redis-host ping
   ```

### Log Analysis

```bash
# API server logs
docker logs budgetguard-api --tail 100 -f

# Worker logs
docker logs budgetguard-worker --tail 100 -f

# Filter for errors
docker logs budgetguard-api 2>&1 | grep ERROR
```

## 🔄 Updates and Maintenance

### Rolling Updates

```bash
# Docker Compose
docker compose pull
docker compose up -d --no-deps api worker

# Kubernetes
kubectl set image deployment/budgetguard-api api=budgetguard/core:v1.2.0
kubectl rollout status deployment/budgetguard-api
```

### Database Migrations

```bash
# Backup before migration
pg_dump $DATABASE_URL > pre_migration_backup.sql

# Run migration
npm run migrate

# Verify migration
npx prisma migrate status
```

## 📋 Deployment Checklist

### Pre-deployment
- [ ] OPA installed and policy bundle built
- [ ] Environment variables configured (main .env and dashboard .env)
- [ ] SSL certificates obtained
- [ ] Database backups scheduled
- [ ] Monitoring setup complete
- [ ] Security review completed

### Deployment
- [ ] Database services started first
- [ ] Database migrations applied successfully  
- [ ] Demo data seeded
- [ ] API services deployed successfully
- [ ] Background worker started
- [ ] Health checks passing
- [ ] Dashboard accessible and functioning
- [ ] Load balancer configured
- [ ] DNS records updated

### Post-deployment
- [ ] End-to-end API testing performed
- [ ] Dashboard functionality verified
- [ ] Tenant creation and API key generation tested
- [ ] Chat completion proxy tested
- [ ] Monitoring alerts configured
- [ ] Documentation updated
- [ ] Team notified of changes
- [ ] Rollback plan documented

---

## 🆘 Support

For deployment issues:
- Check [README.md](README.md) troubleshooting section
- Review logs for error messages
- Create GitHub issue with deployment details
- Include environment configuration (redacted secrets)

**Common Setup Issues:**
- Missing OPA installation causes policy bundle build failures
- Missing `VITE_ADMIN_API_KEY` in dashboard `.env` causes dashboard crashes
- Wrong step order (migrations before database startup) causes connection errors
- Missing `env_file` in docker-compose.yml causes environment variable issues

Remember to never commit secrets to version control and always use environment variables for sensitive configuration!