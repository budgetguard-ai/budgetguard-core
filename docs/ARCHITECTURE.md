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
