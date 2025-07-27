# BudgetGuard Core Architecture

## System Overview

BudgetGuard Core is a high-performance AI gateway designed to provide budget controls, rate limiting, and policy enforcement for AI API requests. It acts as a transparent proxy between client applications and AI providers (OpenAI, Anthropic, Google), adding minimal latency (~10-15ms) while ensuring cost control and compliance.

### High-Level Architecture

```
┌─────────────┐    ┌─────────────────┐    ┌──────────────┐    ┌─────────────┐
│   Client    │───▶│  BudgetGuard    │───▶│   Provider   │───▶│ AI Response │
│ Application │    │   API Gateway   │    │  (OpenAI,    │    │             │
└─────────────┘    └─────────────────┘    │ Anthropic,   │    └─────────────┘
                           │               │  Google)     │
                           ▼               └──────────────┘
                   ┌─────────────────┐
                   │  Policy Engine  │
                   │   (OPA/Rego)    │
                   └─────────────────┘
                           │
                           ▼
                   ┌─────────────────┐    ┌─────────────┐
                   │    Database     │    │    Redis    │
                   │   (Postgres)    │◀──▶│   (Cache)   │
                   └─────────────────┘    └─────────────┘
                           ▲
                           │
                   ┌─────────────────┐
                   │ Background      │
                   │ Worker Process  │
                   └─────────────────┘
```

## Core Components

### 1. API Gateway (`src/server.ts`)

The main Fastify-based HTTP server that handles all incoming requests. Key responsibilities:

- **Request Interception**: Captures all `/v1/chat/completions` and `/v1/responses` requests
- **Authentication**: Validates API keys and extracts tenant context
- **Budget Validation**: Checks current usage against tenant budgets
- **Rate Limiting**: Enforces per-minute request limits per tenant
- **Policy Evaluation**: Runs OPA policies before forwarding requests
- **Request Forwarding**: Proxies approved requests to appropriate AI providers
- **Usage Tracking**: Logs all requests to Redis streams for background processing

### 2. Policy Engine (`src/policy/`)

Built on Open Policy Agent (OPA) with Rego policy language:

- **Policy File**: `src/policy/opa.rego` contains business rules
- **WASM Compilation**: Policies are compiled to WASM for fast evaluation
- **Input Context**: Receives tenant info, route, timing, and budget data
- **Default Policy**: Allow requests under budget, deny admin routes after 8pm
- **Custom Rules**: Easily extensible for complex business logic

### 3. Provider System (`src/providers/`)

Abstraction layer for different AI providers:

- **Base Interface** (`base.ts`): Common contract for all providers
- **OpenAI Provider** (`openai.ts`): GPT model integration
- **Anthropic Provider** (`anthropic.ts`): Claude model integration  
- **Google Provider** (`google.ts`): Gemini model integration
- **Dynamic Routing**: `getProviderForModel()` selects provider based on model name
- **Health Monitoring**: Each provider implements health check endpoints

### 4. Background Worker (`src/worker.ts`)

Dedicated process for asynchronous operations:

- **Event Processing**: Consumes events from Redis streams (`bg_events`)
- **Usage Persistence**: Writes usage data to `UsageLedger` table
- **Tenant Management**: Auto-creates tenants on first usage
- **Error Handling**: Retries failed operations with exponential backoff

### 5. Multi-tenant System

Comprehensive tenant isolation:

- **Tenant Identification**: Via `X-Tenant-Id` header or API key mapping
- **Resource Scoping**: All budgets, rate limits, and usage data are tenant-specific
- **Default Tenant**: "public" tenant for unauthenticated requests
- **API Key Management**: Each tenant can have multiple API keys

## Request Flow

### 1. Request Reception
```typescript
// Client sends request to /v1/chat/completions
POST /v1/chat/completions
Headers:
  Authorization: Bearer sk-...
  X-Tenant-Id: company-xyz
  Content-Type: application/json
Body: { model: "gpt-4.1", messages: [...] }
```

### 2. Authentication & Tenant Resolution
```typescript
// Extract tenant from header or API key lookup
const tenant = extractTenantFromRequest(request);
const apiKey = validateApiKey(request.headers.authorization);
```

### 3. Budget & Rate Limit Checks
```typescript
// Fast Redis lookup for current usage
const budget = await readBudget({ tenant, period: "monthly", redis });
const rateLimit = await readRateLimit({ tenant, redis });

// Check if request would exceed limits
if (currentUsage + estimatedCost > budget.amount) {
  return { status: 429, error: "Budget exceeded" };
}
```

### 4. Policy Evaluation
```typescript
// OPA policy evaluation with context
const policyInput = {
  tenant: tenant,
  route: "/v1/chat/completions",
  time: new Date().toISOString(),
  budgets: budgetArray
};

const decision = await evaluatePolicy(policyInput);
if (!decision.allow) {
  return { status: 403, error: decision.reason };
}
```

### 5. Provider Selection & Forwarding
```typescript
// Dynamic provider selection based on model
const provider = await getProviderForModel(request.body.model, prisma, config);

// Forward request to selected provider
const response = await provider.chatCompletion(request.body);
```

### 6. Usage Tracking
```typescript
// Calculate actual token usage and cost
const { promptTokens, completionTokens, cost } = await countTokensAndCost(
  request.body, response.data, model
);

// Stream usage event for background processing
await redis.xAdd("bg_events", "*", {
  tenant,
  route: "/v1/chat/completions",
  model,
  usd: cost.toString(),
  promptTok: promptTokens.toString(),
  compTok: completionTokens.toString(),
  ts: Date.now().toString()
});
```

## Data Architecture

### Database Schema (Postgres)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `Tenant` | Customer accounts | `name`, `rateLimitPerMin` |
| `ApiKey` | Authentication tokens | `key`, `tenantId`, `isActive` |
| `Budget` | Spending limits | `period`, `amountUsd`, `startDate`, `endDate` |
| `UsageLedger` | Immutable usage records | `tenant`, `model`, `usd`, `promptTok`, `compTok` |
| `ModelPricing` | Token costs per model | `model`, `provider`, `promptPrice`, `completionPrice` |
| `PolicyBundle` | Compiled OPA policies | `version`, `bundle` |
| `Alert` | Notification rules | `tenantId`, `type`, `threshold` |
| `AuditLog` | System actions | `action`, `tenantId`, `metadata` |

### Redis Cache Patterns

#### Budget Caching
```redis
Key: budget:<tenant>:<period>
Value: JSON { amount: 100, used: 25.50, startDate: "2024-01-01", endDate: "2024-01-31" }
TTL: 300 seconds (5 minutes)
```

#### Rate Limiting
```redis
Key: rate_limit:<tenant>:<minute>
Value: request_count
TTL: 60 seconds
```

#### Usage Event Streaming
```redis
Stream: bg_events
Fields: { tenant, route, model, usd, promptTok, compTok, ts }
Consumer: background worker process
```

## Provider System Architecture

### Model-to-Provider Mapping

The system uses the `ModelPricing` table to determine which provider handles each model:

```sql
SELECT provider FROM ModelPricing WHERE model = 'gpt-4.1';
-- Returns: "openai"

SELECT provider FROM ModelPricing WHERE model = 'claude-3-sonnet';
-- Returns: "anthropic"

SELECT provider FROM ModelPricing WHERE model = 'gemini-pro';
-- Returns: "google"
```

### Provider Configuration

Each provider requires specific configuration:

```typescript
// OpenAI Provider
const openaiProvider = new OpenAIProvider({
  apiKey: process.env.OPENAI_KEY || request.headers['x-openai-key'],
  baseUrl: "https://api.openai.com/v1"
});

// Anthropic Provider  
const anthropicProvider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY || request.headers['x-anthropic-key'],
  baseUrl: "https://api.anthropic.com"
});

// Google Provider
const googleProvider = new GoogleProvider({
  apiKey: process.env.GOOGLE_API_KEY || request.headers['x-google-api-key'],
  baseUrl: "https://generativelanguage.googleapis.com"
});
```

### Special Pricing Handling

Some models require special pricing logic:

```typescript
// Gemini 2.5 Pro has tiered pricing
if (model === 'gemini-2.5-pro') {
  const pricing = totalTokens <= 200000 
    ? { prompt: 0.00025, completion: 0.001 }  // ≤200k tokens
    : { prompt: 0.00050, completion: 0.002 }; // >200k tokens
}
```

## Caching Strategy

### Two-Tier Caching Architecture

1. **Redis (L1 Cache)**: Sub-millisecond lookups for hot data
   - Budget current usage and limits
   - Rate limit counters
   - Session data

2. **Postgres (L2 Cache)**: Authoritative data store
   - All persistent state
   - Historical usage data
   - Configuration and policies

### Cache Invalidation

```typescript
// Budget updates invalidate cache
async function setBudget(tenant: string, period: string, amount: number) {
  // Update database
  await prisma.budget.upsert({ ... });
  
  // Invalidate Redis cache
  await redis.del(`budget:${tenant}:${period}`);
}
```

### Cache Warming

```typescript
// Background process keeps hot budgets in cache
async function warmBudgetCache() {
  const activeTenants = await prisma.tenant.findMany({
    where: { lastUsedAt: { gt: oneDayAgo } }
  });
  
  for (const tenant of activeTenants) {
    await readBudget({ tenant: tenant.name, period: "monthly", redis });
  }
}
```

## Background Processing Architecture

### Event-Driven Usage Tracking

The system uses Redis Streams for reliable, ordered event processing:

```typescript
// Producer (API Gateway)
await redis.xAdd("bg_events", "*", {
  tenant: "company-xyz",
  route: "/v1/chat/completions", 
  model: "gpt-4.1",
  usd: "0.0234",
  promptTok: "150",
  compTok: "89",
  ts: "1704067200000"
});

// Consumer (Background Worker)
const events = await redis.xRead(
  { key: "bg_events", id: lastProcessedId },
  { BLOCK: 0, COUNT: 10 }
);
```

### Worker Process Responsibilities

1. **Usage Persistence**: Write events to `UsageLedger` table
2. **Tenant Auto-creation**: Create tenant records on first usage
3. **Error Recovery**: Retry failed operations with exponential backoff
4. **Metrics Collection**: Aggregate usage statistics

### Reliability Features

- **At-least-once delivery**: Redis Streams guarantee event delivery
- **Idempotent operations**: Safe to replay events
- **Dead letter handling**: Failed events moved to error stream
- **Monitoring**: Health checks and metrics for worker status

## Security Model

### API Key Management

```typescript
// Multi-tier key validation
1. Admin keys: Full system access (ADMIN_API_KEY env var)
2. Tenant keys: Scoped to specific tenant (stored in ApiKey table)
3. Provider keys: Direct provider access (passed through)
```

### Tenant Isolation

- **Data Isolation**: All queries filtered by `tenantId`
- **Resource Isolation**: Budgets and rate limits per tenant
- **Key Isolation**: API keys cannot access other tenants' data

### Secure Defaults

```typescript
// Default budget enforcement
const DEFAULT_BUDGET = 50; // USD

// Default rate limiting  
const DEFAULT_RATE_LIMIT = 60; // requests per minute

// Secure policy evaluation
const defaultPolicy = `
package budgetguard
default allow = false
allow {
  input.budgets[_].used < input.budgets[_].amount
}
`;
```

## Performance Characteristics

### Latency Profile

- **Cache Hit**: ~2-5ms additional latency
- **Cache Miss**: ~10-15ms additional latency  
- **Policy Evaluation**: ~1-2ms (WASM execution)
- **Provider Health Check**: ~100-500ms (cached for 5 minutes)

### Throughput Capacity

- **Concurrent Requests**: 1000+ requests/second per instance
- **Redis Operations**: 10,000+ ops/second
- **Database Connections**: Configurable pool size (default: 10)
- **Worker Throughput**: 100+ events/second per worker

### Scaling Considerations

- **Horizontal Scaling**: Stateless API servers behind load balancer
- **Database Scaling**: Read replicas for analytics queries
- **Redis Scaling**: Redis Cluster for high-availability
- **Worker Scaling**: Multiple worker processes per Redis stream

## Monitoring & Observability

### Health Check Endpoints

```typescript
GET /health              // API server health
GET /admin/health        // Provider health status
GET /admin/metrics       // Usage and performance metrics
```

### Structured Logging

```typescript
// Request logging with correlation IDs
logger.info({
  requestId: "req_123",
  tenant: "company-xyz", 
  model: "gpt-4.1",
  latency: 45,
  cost: 0.0234
}, "Request completed");
```

### Key Metrics

- **Request rate**: Requests per second by tenant/model
- **Error rate**: 4xx/5xx responses by endpoint
- **Latency percentiles**: P50, P95, P99 response times
- **Budget utilization**: Spending vs. limits by tenant
- **Provider health**: Availability and response times

This architecture provides a robust, scalable foundation for AI API cost control while maintaining high performance and reliability.
