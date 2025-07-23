import type {
  Tenant,
  ApiKey,
  Budget,
  ModelPricing,
  HealthResponse,
  CreateTenantRequest,
  UpdateRateLimitRequest,
  CreateBudgetRequest,
  CreateModelPricingRequest,
  UpdateModelPricingRequest,
} from "../types";

class ApiClient {
  private baseUrl: string;
  private adminKey: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_BASE_URL || "";
    this.adminKey = import.meta.env.VITE_ADMIN_API_KEY || "your-admin-key-here";
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": this.adminKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  // Health endpoints
  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/health");
  }

  // Tenant endpoints
  async getTenants(): Promise<Tenant[]> {
    return this.request<Tenant[]>("/admin/tenant");
  }

  async getTenant(id: number): Promise<Tenant> {
    return this.request<Tenant>(`/admin/tenant/${id}`);
  }

  async createTenant(data: CreateTenantRequest): Promise<Tenant> {
    return this.request<Tenant>("/admin/tenant", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Rate limit endpoints
  async getTenantRateLimit(
    tenantId: number,
  ): Promise<{ rateLimitPerMin: number | null }> {
    return this.request<{ rateLimitPerMin: number | null }>(
      `/admin/tenant/${tenantId}/ratelimit`,
    );
  }

  async updateTenantRateLimit(
    tenantId: number,
    data: UpdateRateLimitRequest,
  ): Promise<{ rateLimitPerMin: number | null }> {
    return this.request<{ rateLimitPerMin: number | null }>(
      `/admin/tenant/${tenantId}/ratelimit`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    );
  }

  // Budget endpoints
  async getTenantBudgets(tenantId: number): Promise<Budget[]> {
    return this.request<Budget[]>(`/admin/tenant/${tenantId}/budgets`);
  }

  async createTenantBudgets(
    tenantId: number,
    data: CreateBudgetRequest,
  ): Promise<Budget[]> {
    return this.request<Budget[]>(`/admin/tenant/${tenantId}/budgets`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateBudget(budgetId: number, data: Partial<Budget>): Promise<Budget> {
    return this.request<Budget>(`/admin/budget/${budgetId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteBudget(budgetId: number): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/admin/budget/${budgetId}`, {
      method: "DELETE",
    });
  }

  // Usage endpoints
  async getTenantUsage(tenantId: number): Promise<Record<string, number>> {
    return this.request<Record<string, number>>(
      `/admin/tenant/${tenantId}/usage`,
    );
  }

  // API Key endpoints
  async getTenantApiKeys(tenantId: number): Promise<ApiKey[]> {
    return this.request<ApiKey[]>(`/admin/tenant/${tenantId}/apikeys`);
  }

  async createTenantApiKey(tenantId: number): Promise<ApiKey> {
    return this.request<ApiKey>(`/admin/tenant/${tenantId}/apikeys`, {
      method: "POST",
    });
  }

  async deleteApiKey(keyId: number): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/admin/apikey/${keyId}`, {
      method: "DELETE",
    });
  }

  // Model pricing endpoints
  async getModelPricing(): Promise<ModelPricing[]> {
    return this.request<ModelPricing[]>("/admin/model-pricing");
  }

  async createModelPricing(
    data: CreateModelPricingRequest,
  ): Promise<ModelPricing> {
    return this.request<ModelPricing>("/admin/model-pricing", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateModelPricing(
    idOrModel: string | number,
    data: UpdateModelPricingRequest,
  ): Promise<ModelPricing> {
    return this.request<ModelPricing>(`/admin/model-pricing/${idOrModel}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient();
