# API Documentation

Start the service and open [http://localhost:3000/docs](http://localhost:3000/docs) to view the Swagger UI. The OpenAPI JSON is available at `/docs/json`.

Example request:

```bash
curl -X POST -H "Content-Type: application/json" \
     -H "Authorization: Bearer <OPENAI_KEY>" \
     -H "X-Tenant-Id: demo" \
     -H "X-API-Key: <TENANT_API_KEY>" \
     -d '{"model":"gpt-3.5-turbo","input":"hello"}' \
    http://localhost:3000/v1/responses
```

### Manage rate limits

Set a tenant's per-minute limit (use `null` for unlimited):

```bash
curl -X PUT \
     -H "X-Admin-Key: <ADMIN_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"rateLimitPerMin":null}' \
     http://localhost:3000/admin/tenant/1/ratelimit
```

Retrieve the current setting:

```bash
curl -H "X-Admin-Key: <ADMIN_KEY>" \
     http://localhost:3000/admin/tenant/1/ratelimit
```

### Manage model pricing

List current model pricing records:

```bash
curl -H "X-Admin-Key: <ADMIN_KEY>" \
     http://localhost:3000/admin/model-pricing
```

Add a new pricing record:

```bash
curl -X POST -H "X-Admin-Key: <ADMIN_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"model":"gpt-4","versionTag":"gpt-4-2024-04-01","inputPrice":10,"cachedInputPrice":2,"outputPrice":30}' \
     http://localhost:3000/admin/model-pricing
```

Update an existing record by model name:

```bash
curl -X PUT -H "X-Admin-Key: <ADMIN_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"outputPrice":25}' \
     http://localhost:3000/admin/model-pricing/gpt-4
```
