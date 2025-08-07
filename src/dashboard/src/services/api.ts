import type {
  Tenant,
  ApiKey,
  Budget,
  ModelPricing,
  HealthResponse,
  CreateTenantRequest,
  UpdateTenantRequest,
  UpdateRateLimitRequest,
  CreateBudgetRequest,
  CreateModelPricingRequest,
  UpdateModelPricingRequest,
  Tag,
  TagBudget,
  CreateTagRequest,
  UpdateTagRequest,
  CreateTagBudgetRequest,
  UpdateTagBudgetRequest,
  TagAnalyticsParams,
  TagAnalytics,
} from "../types";

class ApiClient {
  private baseUrl: string;
  private adminKey: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_BASE_URL || "";
    this.adminKey = import.meta.env.VITE_ADMIN_API_KEY || "your-admin-key-here";

    // Security check: Prevent default admin key in production
    if (
      import.meta.env.MODE === "production" &&
      this.adminKey === "your-admin-key-here"
    ) {
      throw new Error(
        "Critical: Admin API key is not configured in production. Set VITE_ADMIN_API_KEY environment variable.",
      );
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    // Set Content-Type header only when a request body is provided
    const headers: Record<string, string> = {
      "X-Admin-Key": this.adminKey,
    };

    if (options.body && options.body !== "") {
      headers["Content-Type"] = "application/json";
    }

    // Merge with any additional headers from options
    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    const response = await fetch(url, {
      ...options,
      headers,
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

  async updateTenant(id: number, data: UpdateTenantRequest): Promise<Tenant> {
    return this.request<Tenant>(`/admin/tenant/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteTenant(id: number): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/admin/tenant/${id}`, {
      method: "DELETE",
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

  async getTenantUsageHistory(
    tenantId: number,
    days: number = 30,
  ): Promise<Array<{ date: string; usage: number }>> {
    return this.request<Array<{ date: string; usage: number }>>(
      `/admin/tenant/${tenantId}/usage/history?days=${days}`,
    );
  }

  async getTenantModelBreakdown(
    tenantId: number,
    days: number = 30,
  ): Promise<Array<{ model: string; usage: number; percentage: number }>> {
    return this.request<
      Array<{ model: string; usage: number; percentage: number }>
    >(`/admin/tenant/${tenantId}/usage/models?days=${days}`);
  }

  async getTenantUsageLedger(
    tenantId: number,
    params?: {
      days?: number;
      page?: number;
      limit?: number;
      model?: string;
      route?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{
    data: Array<{
      id: string;
      ts: string;
      tenant: string;
      route: string;
      model: string;
      usd: string;
      promptTok: number;
      compTok: number;
      tenantId: number;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const queryParams = new URLSearchParams();
    if (params?.days) queryParams.append("days", params.days.toString());
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.model) queryParams.append("model", params.model);
    if (params?.route) queryParams.append("route", params.route);
    if (params?.startDate) queryParams.append("startDate", params.startDate);
    if (params?.endDate) queryParams.append("endDate", params.endDate);

    const queryString = queryParams.toString();
    const url = `/admin/tenant/${tenantId}/usage/ledger${queryString ? `?${queryString}` : ""}`;

    return this.request(url);
  }

  async getUsageLedger(params?: {
    days?: number;
    page?: number;
    limit?: number;
    model?: string;
    route?: string;
    tenant?: string;
    tenantId?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    data: Array<{
      id: string;
      ts: string;
      tenant: string;
      route: string;
      model: string;
      usd: string;
      promptTok: number;
      compTok: number;
      tenantId: number;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const queryParams = new URLSearchParams();
    if (params?.days) queryParams.append("days", params.days.toString());
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.model) queryParams.append("model", params.model);
    if (params?.route) queryParams.append("route", params.route);
    if (params?.tenant) queryParams.append("tenant", params.tenant);
    if (params?.tenantId)
      queryParams.append("tenantId", params.tenantId.toString());
    if (params?.startDate) queryParams.append("startDate", params.startDate);
    if (params?.endDate) queryParams.append("endDate", params.endDate);

    const queryString = queryParams.toString();
    const url = `/admin/usage/ledger${queryString ? `?${queryString}` : ""}`;

    return this.request(url);
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

  // Tag management endpoints
  async getTenantTags(
    tenantId: number,
    includeInactive?: boolean,
  ): Promise<Tag[]> {
    const query = includeInactive ? "?includeInactive=true" : "";
    return this.request<Tag[]>(`/admin/tenant/${tenantId}/tags${query}`);
  }

  async createTag(tenantId: number, data: CreateTagRequest): Promise<Tag> {
    return this.request<Tag>(`/admin/tenant/${tenantId}/tags`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getTag(tenantId: number, tagId: number): Promise<Tag> {
    return this.request<Tag>(`/admin/tenant/${tenantId}/tags/${tagId}`);
  }

  async updateTag(
    tenantId: number,
    tagId: number,
    data: UpdateTagRequest,
  ): Promise<Tag> {
    return this.request<Tag>(`/admin/tenant/${tenantId}/tags/${tagId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteTag(tenantId: number, tagId: number): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(
      `/admin/tenant/${tenantId}/tags/${tagId}`,
      {
        method: "DELETE",
      },
    );
  }

  // Tag budget management endpoints
  async getTagBudgets(tenantId: number): Promise<TagBudget[]> {
    return this.request<TagBudget[]>(`/admin/tenant/${tenantId}/tag-budgets`);
  }

  async createTagBudget(
    tenantId: number,
    data: CreateTagBudgetRequest,
  ): Promise<TagBudget> {
    return this.request<TagBudget>(`/admin/tenant/${tenantId}/tag-budgets`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTagBudget(
    tenantId: number,
    budgetId: number,
    data: UpdateTagBudgetRequest,
  ): Promise<TagBudget> {
    return this.request<TagBudget>(
      `/admin/tenant/${tenantId}/tag-budgets/${budgetId}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    );
  }

  async deleteTagBudget(
    tenantId: number,
    budgetId: number,
  ): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(
      `/admin/tenant/${tenantId}/tag-budgets/${budgetId}`,
      {
        method: "DELETE",
      },
    );
  }

  // Tag analytics endpoints
  async getTagUsageAnalytics(
    tenantId: number,
    params?: TagAnalyticsParams,
  ): Promise<TagAnalytics> {
    const queryParams = new URLSearchParams();
    if (params?.days) queryParams.append("days", params.days.toString());
    if (params?.startDate) queryParams.append("startDate", params.startDate);
    if (params?.endDate) queryParams.append("endDate", params.endDate);
    if (params?.tagIds?.length) {
      params.tagIds.forEach((id: number) =>
        queryParams.append("tagId", id.toString()),
      );
    }

    const queryString = queryParams.toString();
    const url = `/admin/tenant/${tenantId}/tag-analytics${queryString ? `?${queryString}` : ""}`;

    return this.request(url);
  }
}

export const apiClient = new ApiClient();
