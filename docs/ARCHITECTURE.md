# Database Architecture

All state is stored in Postgres and cached in Redis.

| Table | Purpose |
| --- | --- |
| Tenant | Registered customers |
| ApiKey | API keys scoped to a tenant |
| Budget | Budget windows and limits |
| PolicyBundle | Compiled OPA policies |
| Alert | Spend notifications |
| AuditLog | Immutable action log |
| UsageLedger | Request records |

Run migrations during development with:

```bash
npx prisma migrate dev
```

Deploy migrations with:

```bash
npm run migrate
```

Budgets are cached in Redis using `budget:<tenant>:<period>` keys. When a request arrives, the server gathers usage and budgets for policy evaluation before proxying to OpenAI.
