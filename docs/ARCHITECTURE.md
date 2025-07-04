# Database Architecture

This project stores usage and tenant configuration in Postgres. The core tables are:

| Table        | Purpose                                   |
|--------------|-------------------------------------------|
| Tenant       | Registered customers or groups            |
| ApiKey       | Keys associated with a tenant             |
| Budget       | Budget windows and amounts per tenant     |
| PolicyBundle | Compiled policy modules for enforcement   |
| Alert        | Notification targets for spend thresholds |
| AuditLog     | Immutable audit trail of actions          |
| UsageLedger  | Raw usage events written by the worker    |

Migrations are managed with Prisma. During development run:

```bash
npx prisma migrate dev
```

To apply migrations in production use:

```bash
npm run migrate
```

The ERD is included in the README for reference.
All tables include timestamp fields for auditing and change tracking.

Budget amounts are cached in Redis using `budget:<tenant>:<period>` keys for
fast enforcement. The worker and admin API keep Postgres as the source of truth
and update Redis whenever budgets change. When a budget is requested, the server
checks Redis first, then falls back to Postgres and finally environment
defaults.

At request time the server gathers the current usage and budget for all
configured periods, building a single input object for the OPA policy engine:

```json
{
  "tenant": "t1",
  "route": "/v1/completions",
  "time": 12,
  "budgets": [
    { "period": "daily", "usage": 1, "budget": 10, "start": "...", "end": "..." }
  ]
}
```

OPA returns `true` only if every period is under budget and no other rule
denies the request. The server enforces the decision before proxying to OpenAI.
