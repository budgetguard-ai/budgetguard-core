// Base types from Prisma schema
export interface Tenant {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  rateLimitPerMin: number | null;
}

export interface ApiKey {
  id: number;
  key?: string; // Only included when creating
  tenantId: number;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  tenant?: Tenant;
}

export interface Budget {
  id: number;
  tenantId: number;
  period: "daily" | "monthly" | "custom";
  amountUsd: string; // Decimal as string
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  tenant?: Tenant;
}

export interface UsageLedger {
  id: string; // BigInt as string
  ts: string;
  tenant: string;
  route: string;
  usd: string; // Decimal as string
  promptTok: number;
  compTok: number;
  tenantId: number | null;
  tenantRef?: Tenant;
}

export interface ModelPricing {
  id: number;
  model: string;
  versionTag: string;
  inputPrice: string; // Decimal as string
  cachedInputPrice: string; // Decimal as string
  outputPrice: string; // Decimal as string
  provider: "openai" | "anthropic" | "google";
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: number;
  tenantId: number;
  actor: string;
  event: string;
  details: string;
  createdAt: string;
  tenant?: Tenant;
}

// API Response types
export interface HealthResponse {
  ok: boolean;
  dependencies: {
    database: boolean;
    redis: boolean;
    providers: {
      configured: number;
      healthy: number;
    };
  };
}

export interface BudgetUsage {
  period: string;
  usage: number;
  budget: number;
  start: string;
  end: string;
}

// Request types
export interface CreateTenantRequest {
  name: string;
}

export interface UpdateTenantRequest {
  name?: string;
  rateLimitPerMin?: number | null;
}

export interface UpdateRateLimitRequest {
  rateLimitPerMin: number | null;
}

export interface CreateBudgetRequest {
  budgets: Array<{
    period: "daily" | "monthly" | "custom";
    amountUsd: number;
    startDate?: string;
    endDate?: string;
  }>;
}

export interface CreateModelPricingRequest {
  model: string;
  versionTag: string;
  inputPrice: number;
  cachedInputPrice: number;
  outputPrice: number;
  provider?: "openai" | "anthropic" | "google";
}

export interface UpdateModelPricingRequest {
  model?: string;
  versionTag?: string;
  inputPrice?: number;
  cachedInputPrice?: number;
  outputPrice?: number;
  provider?: "openai" | "anthropic" | "google";
}

// Store types
export interface DashboardStore {
  selectedTenant: Tenant | null;
  setSelectedTenant: (tenant: Tenant | null) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

// Chart data types
export interface UsageChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
  }>;
}

export interface BudgetChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor: string[];
  }>;
}
