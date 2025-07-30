# BudgetGuard API Reference

Complete API documentation for BudgetGuard's FinOps control plane.

**Base URL:** `http://localhost:3000` (development) | `https://your-budgetguard.com` (production)

**Interactive Docs:** [http://localhost:3000/docs](http://localhost:3000/docs)

## Authentication

| Key Type | Header | Purpose |
|----------|--------|---------|
| **Admin Key** | `X-Admin-Key` | Administrative operations |
| **Tenant Key** | `X-API-Key` | Tenant-specific operations |
| **Provider Key** | `Authorization: Bearer` | AI provider access |

## Proxy Endpoints

### Chat Completions
`POST /v1/chat/completions`

Proxy requests to OpenAI, Anthropic, or Google with budget enforcement.

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_KEY" \
  -H "X-Tenant-Id: demo" \
  -H "X-API-Key: $TENANT_API_KEY" \
  -d '{
    "model": "gpt-4.1",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

**Supported Models:**
- **OpenAI**: `gpt-4.1`, `gpt-4o`, `o1`, `o3`
- **Anthropic**: `claude-3-5-haiku-latest`, `claude-3-5-sonnet-latest`
- **Google**: `gemini-2.5-flash`, `gemini-2.5-pro`

## Admin API

### Create Tenant
```bash
curl -X POST http://localhost:3000/admin/tenant \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ACME Corp",
    "rateLimitPerMin": 100,
    "budgets": [{
      "period": "monthly",
      "limitUsd": 1000
    }]
  }'
```

### Get Tenant
```bash
curl -H "X-Admin-Key: $ADMIN_KEY" \
     http://localhost:3000/admin/tenant/123
```

### Set Budget
```bash
curl -X POST http://localhost:3000/admin/tenant/123/budgets \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "period": "monthly",
    "limitUsd": 500
  }'
```

### Generate API Key
```bash
curl -X POST http://localhost:3000/admin/tenant/123/apikeys \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Key"
  }'
```

### Set Rate Limit
```bash
curl -X PUT http://localhost:3000/admin/tenant/123/ratelimit \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"rateLimitPerMin": 50}'
```

## Health & Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

### Detailed Health
```bash
curl http://localhost:3000/health/detailed
```

## Error Handling

**Error Format:**
```json
{
  "error": {
    "code": "BUDGET_EXCEEDED",
    "message": "Monthly budget of $100 exceeded",
    "timestamp": "2025-01-15T10:00:00Z"
  }
}
```

**Common Error Codes:**
- `BUDGET_EXCEEDED` (429) - Budget limit reached
- `RATE_LIMIT_EXCEEDED` (429) - Rate limit exceeded  
- `INVALID_API_KEY` (401) - Invalid API key
- `TENANT_NOT_FOUND` (404) - Tenant not found

## Rate Limiting

**Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1642248000
```

**Default:** 100 requests/minute per tenant  
**Configure:** Set per-tenant via admin API  
**Disable:** Set `rateLimitPerMin: 0`

## Examples

### OpenAI Request
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_KEY" \
  -H "X-Tenant-Id: demo" \
  -H "X-API-Key: $TENANT_KEY" \
  -d '{"model": "gpt-4.1", "messages": [{"role": "user", "content": "Hi"}]}'
```

### Anthropic Request
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "X-Anthropic-Key: $ANTHROPIC_KEY" \
  -H "X-Tenant-Id: demo" \
  -H "X-API-Key: $TENANT_KEY" \
  -d '{"model": "claude-3-5-haiku-latest", "messages": [{"role": "user", "content": "Hi"}]}'
```

### Streaming
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_KEY" \
  -H "X-Tenant-Id: demo" \
  -H "X-API-Key: $TENANT_KEY" \
  -d '{"model": "gpt-4.1", "messages": [{"role": "user", "content": "Tell a story"}], "stream": true}'
```

---

**Support:** [Interactive Docs](http://localhost:3000/docs) • [GitHub Issues](https://github.com/budgetguard-ai/budgetguard-core/issues)