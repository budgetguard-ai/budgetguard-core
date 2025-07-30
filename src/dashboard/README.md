# BudgetGuard Dashboard

React-based management dashboard for BudgetGuard AI proxy system with Material Design 3.

## Features

### System Overview
- **Real-time Health Monitoring** - Database, Redis, and AI provider status
- **System Metrics** - Request volumes, response times, error rates
- **Alert Dashboard** - Critical system notifications

### Tenant Management
- **Tenant List** - View all tenants with search and filtering
- **Tenant Creation** - Add new tenants with budget and rate limit setup
- **Tenant Editing** - Modify tenant settings, budgets, and permissions
- **Bulk Operations** - Mass updates for multiple tenants

### Budget & Usage Analytics
- **Budget Overview** - Visual budget utilization across all tenants
- **Usage Trends** - Historical usage patterns and forecasting
- **Cost Breakdown** - Per-model and per-tenant cost analysis
- **Budget Alerts** - Configurable threshold notifications

### API Key Management
- **Key Generation** - Create tenant-specific API keys
- **Key Rotation** - Secure key lifecycle management
- **Usage Tracking** - Monitor API key usage patterns

### User Experience
- **Material Design 3** - Modern, accessible UI components
- **Light/Dark Themes** - Automatic and manual theme switching
- **Responsive Design** - Optimized for desktop, tablet, and mobile

## Quick Start

```bash
cd src/dashboard
npm install

# Configure environment
echo "VITE_API_BASE_URL=http://localhost:3000" > .env
echo "VITE_ADMIN_API_KEY=your-admin-key" >> .env

# Start development
npm run dev  # Available at http://localhost:3001
```

## Production Build

```bash
npm run build
```

## Tech Stack

- **React 18** + TypeScript
- **Material-UI 5** - Component library
- **Vite** - Build tool
- **React Query** - API state management
- **Chart.js** - Data visualization

## Screenshots

![Tenant Management](screenshots/tenant-management.png)
![Usage Reports](screenshots/usage-reports.png)
![Dark Theme](screenshots/dashboard-dark.png)

## Environment Variables

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_ADMIN_API_KEY=your-secure-admin-key-here
VITE_APP_TITLE="BudgetGuard Dashboard"
```

## API Integration

The dashboard communicates with BudgetGuard API using admin endpoints:
- `GET /admin/tenant` - List tenants
- `POST /admin/tenant` - Create tenant
- `GET /admin/usage-ledger` - Usage analytics
- `GET /health/detailed` - System health

Requires `X-Admin-Key` header for authentication.