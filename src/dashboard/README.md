# BudgetGuard Dashboard

A modern React dashboard for managing the BudgetGuard AI proxy system, built with Material Design 3.

## Features

- **System Overview**: Real-time health monitoring for database, Redis, and AI providers
- **Tenant Management**: View and manage tenants with rate limiting
- **Material Design 3**: Modern, accessible UI with light/dark theme support
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development and building
- **Material UI v5** with Material Design 3 theming
- **React Query** for API state management
- **Zustand** for client-side state management
- **React Router v6** for navigation

## Development Setup

### 1. Install Dependencies

```bash
cd src/dashboard
npm install
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_ADMIN_API_KEY=your-secure-admin-key-123
```

**Security Note:** Always use a strong, unique admin key in production. The dashboard will throw an error if the default key is detected in production mode.

### 3. Start Development Server

```bash
npm run dev
```

The dashboard will be available at `http://localhost:3001`

## Building for Production

### Build Dashboard Only

```bash
npm run build
```

### Build from Root Project

```bash
# From the project root
npm run build:dashboard
```

## Integration with Main Server

The dashboard is automatically served by the Fastify server when built:

1. Build the dashboard (creates `dist/` folder)
2. Start the main server
3. Access dashboard at `http://localhost:3000/dashboard`

## API Configuration

The dashboard connects to the BudgetGuard API using:

- **Base URL**: Configured via `VITE_API_BASE_URL`
- **Authentication**: Uses `X-Admin-Key` header
- **Endpoints**: All existing admin API endpoints (`/admin/*`, `/health`)

## Development vs Production

### Development Mode
- Dashboard runs on port 3001
- API calls are proxied to main server (port 3000)
- Hot reload enabled
- React DevTools available

### Production Mode
- Dashboard is built and served from main server
- Single port deployment
- Optimized bundle size
- Service Worker ready

## Project Structure

```
src/dashboard/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── common/         # Generic components
│   │   ├── charts/         # Chart components (future)
│   │   └── layout/         # Layout components
│   ├── pages/              # Main dashboard pages
│   │   ├── Overview.tsx    # System health dashboard
│   │   ├── Tenants.tsx     # Tenant management
│   │   ├── Usage.tsx       # Usage analytics (placeholder)
│   │   └── Settings.tsx    # Settings (placeholder)
│   ├── hooks/              # Custom React hooks
│   │   ├── useApi.ts       # React Query hooks
│   │   └── useStore.ts     # Zustand store
│   ├── services/           # API client
│   │   └── api.ts          # API client with auth
│   ├── types/              # TypeScript definitions
│   │   └── index.ts        # All type definitions
│   ├── utils/              # Helper functions
│   ├── theme.ts            # Material Design 3 theme
│   ├── App.tsx             # Main React app
│   └── main.tsx            # React entry point
├── public/                 # Static assets
├── package.json           # Dashboard dependencies
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript config
└── README.md              # This file
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Next Steps (Phase 2)

The current implementation provides the foundation. Phase 2 will add:

- Tenant creation and editing
- Budget management with charts
- API key management
- Real-time usage monitoring
- Provider health testing

## Material Design 3 Features

- **Dynamic Color System**: Adaptive color palettes
- **Typography Scale**: Consistent text styling
- **Elevation System**: Modern shadow system
- **Component Tokens**: Customizable component styles
- **Theme Toggle**: Light/dark mode with persistence