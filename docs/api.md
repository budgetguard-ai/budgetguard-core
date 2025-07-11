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
