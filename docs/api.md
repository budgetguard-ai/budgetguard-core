# API Documentation

Start the service and open [http://localhost:3000/docs](http://localhost:3000/docs) to view the Swagger UI. The OpenAPI JSON is available at `/docs/json`.

Example request:

```bash
curl -X POST -H "Content-Type: application/json" \
     -H "X-Tenant-Id: demo" \
     -d '{"model":"gpt-3.5-turbo","prompt":"hello"}' \
     http://localhost:3000/v1/completions
```
