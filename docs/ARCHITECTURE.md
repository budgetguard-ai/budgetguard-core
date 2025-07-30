# BudgetGuard Architecture

High-performance AI gateway with budget controls, rate limiting, and policy enforcement. Adds ~10-15ms latency while ensuring cost control.

## System Overview

```
┌─────────────┐    ┌─────────────────┐    ┌──────────────┐
│   Client    │───▶│  BudgetGuard    │───▶│   Provider   │
│ Application │    │   API Gateway   │    │ (OpenAI, etc)│
└─────────────┘    └─────────────────┘    └──────────────┘
                           │
                           ▼
                   ┌─────────────────┐    ┌─────────────┐
                   │    Database     │◀──▶│    Redis    │
                   │   (Postgres)    │    │   (Cache)   │
                   └─────────────────┘    └─────────────┘
                           ▲
                           │
                   ┌─────────────────┐
                   │ Background      │
                   │ Worker Process  │
                   └─────────────────┘
```

## Core Components

### API Gateway (`src/server.ts`)
- **Request Interception**: Captures `/v1/chat/completions` requests
- **Authentication**: API key validation with in-memory cache (5min TTL)
- **Budget Validation**: Ultra-fast checks via batched Redis operations
- **Rate Limiting**: In-memory cache (1min TTL) prevents expensive lookups
- **Policy Evaluation**: Sub-10ms decisions with OPA/Rego
- **Request Forwarding**: Proxies to appropriate AI providers

### Policy Engine (`src/policy/`)
- **OPA/Rego**: Business rules in `src/policy/opa.rego`
- **WASM Compilation**: Fast policy evaluation
- **Default Policy**: Allow under budget, deny admin routes after 8pm

### Provider System (`src/providers/`)
- **OpenAI** (`openai.ts`): GPT models
- **Anthropic** (`anthropic.ts`): Claude models  
- **Google** (`google.ts`): Gemini models
- **Dynamic Routing**: Model name determines provider

### Background Worker (`src/worker.ts`)
- **Event Processing**: Consumes from Redis streams
- **Usage Persistence**: Writes to `UsageLedger` table
- **Tenant Management**: Auto-creates tenants

## Request Flow

1. **Authentication**: Validate API key (cached)
2. **Budget Check**: Batched Redis lookup for limits/usage
3. **Rate Limiting**: Check requests per minute
4. **Policy Evaluation**: OPA decision (~1-2ms)
5. **Provider Selection**: Route by model name
6. **Request Forwarding**: Proxy to AI provider
7. **Usage Tracking**: Log to Redis stream

## Data Storage

### Database Schema (Postgres)
- `Tenant`: Customer accounts and rate limits
- `ApiKey`: Authentication tokens  
- `Budget`: Spending limits by period
- `UsageLedger`: Immutable usage records
- `ModelPricing`: Token costs per model/provider

### Redis Cache Patterns
```redis
# Budget caching
budget:<tenant>:<period> → { amount: 100, used: 25.50 }

# Rate limiting  
rate_limit:<tenant>:<minute> → request_count

# Event streaming
bg_events → { tenant, model, usd, tokens, timestamp }
```

## Performance Optimizations

### Multi-Layer Caching
1. **API Key Cache**: In-memory (5min TTL) - avoids bcrypt
2. **Tenant Cache**: Redis (1hr TTL) - eliminates DB queries  
3. **Budget Cache**: Redis (5min TTL) - fast limit checks
4. **Rate Limit Cache**: In-memory (1min TTL) - prevents DB lookups

### Ultra-Batched Redis
Single `mGet` call for all cache reads instead of sequential lookups:
```typescript
// Before: ~200ms (4 sequential calls)
// After: ~5ms (1 batched call)
const [budget, tenant, rateLimit] = await redis.mGet([
  `budget:${tenant}:monthly`,
  `tenant:${tenant}`,
  `ratelimit:${tenant}`
]);
```

### Performance Results
- **First-time auth**: ~280ms (bcrypt security)
- **Cached auth**: ~10ms (96% improvement)
- **Policy decisions**: 10-30ms total
- **Throughput**: 1000+ requests/second per instance

## Security Model

### API Key Types
- **Admin Keys**: Full system access (`X-Admin-Key`)
- **Tenant Keys**: Scoped access (`X-API-Key`)
- **Provider Keys**: AI provider access (`Authorization`)

### Tenant Isolation
- All data filtered by `tenantId`
- Resource quotas per tenant
- API keys cannot cross tenant boundaries

## Scaling Considerations
- **API Servers**: Stateless, horizontally scalable
- **Workers**: Scale by Redis queue length
- **Database**: Read replicas for analytics
- **Redis**: Cluster for high availability

## Monitoring
- `GET /health` - Basic health check
- `GET /health/detailed` - Full system status
- Structured logging with correlation IDs
- Key metrics: request rate, error rate, latency, budget utilization