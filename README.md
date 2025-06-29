# budgetguard-core

## Rate-Limiting

The server applies a per-tenant sliding window limiter. Configure the maximum
number of requests per minute with the `MAX_REQS_PER_MIN` environment variable
(defaults to `100`). Identify tenants by sending an `X-Tenant-Id` header with
your requests.
