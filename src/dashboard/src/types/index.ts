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
  // New properties from enhanced API response
  currentPeriodStartDate?: string;
  currentPeriodEndDate?: string;
  currentUsage?: number;
  isRecurring?: boolean;
}

export interface UsageLedger {
  id: string; // BigInt as string
  ts: string;
  tenant: string;
  route: string;
  model: string;
  usd: string; // Decimal as string
  promptTok: number;
  compTok: number;
  tenantId: number | null;
  sessionId: string | null;
  status: "success" | "blocked" | "failed";
  tags: Array<{
    id: number;
    name: string;
    path: string | null;
    weight: number;
  }>;
  tenantRef?: Tenant;
}

export interface UsageLedgerResponse {
  data: UsageLedger[];
  total: number;
  page: number;
  limit: number;
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
    startDate?: string; // Only for custom periods
    endDate?: string; // Only for custom periods
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

// Tag-related types
export interface Tag {
  id: number;
  tenantId: number;
  name: string;
  description?: string;
  color?: string;
  path: string;
  parentId?: number;
  isActive: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  parent?: Tag;
  children?: Tag[];
}

export interface TagBudget {
  id: number;
  tagId: number;
  period: "daily" | "monthly" | "custom";
  amountUsd: string; // Decimal as string
  weight: number;
  inheritanceMode: "STRICT" | "LENIENT" | "NONE";
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  tag?: Tag;
  currentUsage?: number;
}

export interface TagUsageData {
  tagId: number;
  tagName: string;
  path: string;
  usage: number;
  requests: number;
  percentage: number;
  color?: string;
}

export interface TagBudgetHealth {
  tagId: number;
  tagName: string;
  budgetId: number;
  period: string;
  budget: number;
  usage: number;
  percentage: number;
  weight: number;
  inheritanceMode: string;
  status: "healthy" | "warning" | "critical";
  daysRemaining?: number;
}

export interface TagTrendData {
  date: string;
  tagUsage: Array<{
    tagId: number;
    tagName: string;
    usage: number;
  }>;
}

export interface TagHierarchyNode {
  id: number;
  name: string;
  path: string;
  usage: number;
  budget?: number;
  children: TagHierarchyNode[];
  parent?: TagHierarchyNode;
}

// Tag request/response types
export interface CreateTagRequest {
  name: string;
  description?: string;
  color?: string;
  parentId?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateTagRequest {
  name?: string;
  description?: string;
  color?: string;
  metadata?: Record<string, unknown>;
  isActive?: boolean;
}

export interface CreateTagBudgetRequest {
  tagId: number;
  period: "daily" | "monthly" | "custom";
  amountUsd: number;
  weight?: number;
  inheritanceMode?: "STRICT" | "LENIENT" | "NONE";
  startDate?: string;
  endDate?: string;
}

export interface UpdateTagBudgetRequest {
  period?: "daily" | "monthly" | "custom";
  amountUsd?: number;
  weight?: number;
  inheritanceMode?: "STRICT" | "LENIENT" | "NONE";
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
}

export interface TagAnalyticsParams {
  days?: number;
  startDate?: string;
  endDate?: string;
  tagIds?: number[];
}

export interface TagAnalytics {
  usage: TagUsageData[];
  budgetHealth: TagBudgetHealth[];
  trends: TagTrendData[];
  hierarchy: TagHierarchyNode[];
  totalUsage: number;
  totalRequests: number;
  activeTags: number;
  criticalBudgets: number;
}

// Session-related types
export interface Session {
  sessionId: string;
  name: string | null;
  path: string | null;
  effectiveBudgetUsd: number | null;
  currentCostUsd: number;
  status: "active" | "budget_exceeded" | "completed" | "error";
  metadata: Record<string, unknown> | null;
  createdAt: string;
  lastActiveAt: string;
  requestCount: number;
}

export interface SessionUsageEntry {
  id: number;
  timestamp: string;
  route: string;
  model: string;
  usd: number;
  promptTokens: number;
  completionTokens: number;
  status: "success" | "blocked" | "failed";
  tags: Array<{
    id: number;
    name: string;
    color?: string;
  }>;
}

export interface SessionsResponse {
  sessions: Session[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SessionUsageResponse {
  session: {
    sessionId: string;
    name: string | null;
    tenantId: number;
    effectiveBudgetUsd: number | null;
    currentCostUsd: number;
    status: string;
  };
  usage: SessionUsageEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SessionFilters {
  startDate?: string;
  endDate?: string;
  status?: "active" | "budget_exceeded" | "completed" | "error";
  search?: string;
  page?: number;
  limit?: number;
}
