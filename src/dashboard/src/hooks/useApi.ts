import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../services/api";
import type {
  Budget,
  CreateTenantRequest,
  UpdateTenantRequest,
  UpdateRateLimitRequest,
  CreateBudgetRequest,
  CreateModelPricingRequest,
  UpdateModelPricingRequest,
} from "../types";

// Query keys
export const queryKeys = {
  health: ["health"] as const,
  tenants: ["tenants"] as const,
  tenant: (id: number) => ["tenant", id] as const,
  tenantRateLimit: (id: number) => ["tenant", id, "rateLimit"] as const,
  tenantBudgets: (id: number) => ["tenant", id, "budgets"] as const,
  tenantUsage: (id: number) => ["tenant", id, "usage"] as const,
  tenantApiKeys: (id: number) => ["tenant", id, "apiKeys"] as const,
  tenantUsageLedger: (id: number, params?: Record<string, unknown>) =>
    ["tenant", id, "usageLedger", params] as const,
  usageLedger: (params?: Record<string, unknown>) =>
    ["usageLedger", params] as const,
  modelPricing: ["modelPricing"] as const,
};

// Health hooks
export const useHealth = () => {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => apiClient.getHealth(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
};

// Tenant hooks
export const useTenants = () => {
  return useQuery({
    queryKey: queryKeys.tenants,
    queryFn: () => apiClient.getTenants(),
  });
};

export const useTenant = (id: number) => {
  return useQuery({
    queryKey: queryKeys.tenant(id),
    queryFn: () => apiClient.getTenant(id),
    enabled: !!id,
  });
};

export const useCreateTenant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTenantRequest) => apiClient.createTenant(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
    },
  });
};

export const useUpdateTenant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateTenantRequest }) =>
      apiClient.updateTenant(id, data),
    onSuccess: (updatedTenant) => {
      // Invalidate the tenants list
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
      // Update the specific tenant cache
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tenant(updatedTenant.id),
      });
      // If rate limit was updated, invalidate rate limit cache
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tenantRateLimit(updatedTenant.id),
      });
    },
  });
};

export const useDeleteTenant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => apiClient.deleteTenant(id),
    onSuccess: (_, deletedId) => {
      // Invalidate the tenants list
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
      // Remove all cached data for the deleted tenant
      void queryClient.removeQueries({ queryKey: queryKeys.tenant(deletedId) });
      void queryClient.removeQueries({
        queryKey: queryKeys.tenantRateLimit(deletedId),
      });
      void queryClient.removeQueries({
        queryKey: queryKeys.tenantBudgets(deletedId),
      });
      void queryClient.removeQueries({
        queryKey: queryKeys.tenantUsage(deletedId),
      });
      void queryClient.removeQueries({
        queryKey: queryKeys.tenantApiKeys(deletedId),
      });
    },
  });
};

// Rate limit hooks
export const useTenantRateLimit = (tenantId: number) => {
  return useQuery({
    queryKey: queryKeys.tenantRateLimit(tenantId),
    queryFn: () => apiClient.getTenantRateLimit(tenantId),
    enabled: !!tenantId,
  });
};

export const useUpdateTenantRateLimit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tenantId,
      data,
    }: {
      tenantId: number;
      data: UpdateRateLimitRequest;
    }) => apiClient.updateTenantRateLimit(tenantId, data),
    onSuccess: (_, { tenantId }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tenantRateLimit(tenantId),
      });
    },
  });
};

// Budget hooks
export const useTenantBudgets = (tenantId: number) => {
  return useQuery({
    queryKey: queryKeys.tenantBudgets(tenantId),
    queryFn: () => apiClient.getTenantBudgets(tenantId),
    enabled: !!tenantId,
  });
};

export const useCreateTenantBudgets = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tenantId,
      data,
    }: {
      tenantId: number;
      data: CreateBudgetRequest;
    }) => apiClient.createTenantBudgets(tenantId, data),
    onSuccess: (_, { tenantId }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tenantBudgets(tenantId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tenantUsage(tenantId),
      });
    },
  });
};

export const useUpdateBudget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      budgetId,
      data,
    }: {
      budgetId: number;
      data: Partial<Budget>;
    }) => apiClient.updateBudget(budgetId, data),
    onSuccess: (updatedBudget) => {
      // Invalidate tenants list to refresh budget info on main page
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
      // Invalidate specific tenant budgets to refresh dialog
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tenantBudgets(updatedBudget.tenantId),
      });
      // Invalidate usage data as budget changes might affect usage display
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tenantUsage(updatedBudget.tenantId),
      });
    },
  });
};

export const useDeleteBudget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (budgetId: number) => apiClient.deleteBudget(budgetId),
    onSuccess: () => {
      // Invalidate tenants list to refresh budget info on main page
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
      // Invalidate all tenant budgets since we don't have tenantId in response
      // This is broader than needed but ensures consistency
      void queryClient.invalidateQueries({
        predicate: (query) => {
          return (
            query.queryKey[0] === "tenant" && query.queryKey[2] === "budgets"
          );
        },
      });
      // Also invalidate usage data
      void queryClient.invalidateQueries({
        predicate: (query) => {
          return (
            query.queryKey[0] === "tenant" && query.queryKey[2] === "usage"
          );
        },
      });
    },
  });
};

// Usage hooks
export const useTenantUsage = (tenantId: number) => {
  return useQuery({
    queryKey: queryKeys.tenantUsage(tenantId),
    queryFn: () => apiClient.getTenantUsage(tenantId),
    enabled: !!tenantId,
    refetchInterval: 60000, // Refresh every minute
  });
};

export const useTenantUsageLedger = (
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
) => {
  return useQuery({
    queryKey: queryKeys.tenantUsageLedger(tenantId, params),
    queryFn: () => apiClient.getTenantUsageLedger(tenantId, params),
    enabled: !!tenantId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
};

export const useUsageLedger = (params?: {
  days?: number;
  page?: number;
  limit?: number;
  model?: string;
  route?: string;
  tenant?: string;
  tenantId?: number;
  startDate?: string;
  endDate?: string;
  status?: "success" | "blocked" | "failed";
}) => {
  return useQuery({
    queryKey: queryKeys.usageLedger(params),
    queryFn: () => apiClient.getUsageLedger(params),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
};

// API Key hooks
export const useTenantApiKeys = (tenantId: number) => {
  return useQuery({
    queryKey: queryKeys.tenantApiKeys(tenantId),
    queryFn: () => apiClient.getTenantApiKeys(tenantId),
    enabled: !!tenantId,
  });
};

export const useCreateTenantApiKey = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tenantId: number) => apiClient.createTenantApiKey(tenantId),
    onSuccess: (_, tenantId) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tenantApiKeys(tenantId),
      });
    },
  });
};

export const useDeleteApiKey = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: number) => apiClient.deleteApiKey(keyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
      // Invalidate all tenant API keys to update the status immediately
      void queryClient.invalidateQueries({
        predicate: (query) => {
          return (
            query.queryKey[0] === "tenant" && query.queryKey[2] === "apiKeys"
          );
        },
      });
    },
  });
};

// Model pricing hooks
export const useModelPricing = () => {
  return useQuery({
    queryKey: queryKeys.modelPricing,
    queryFn: () => apiClient.getModelPricing(),
  });
};

export const useCreateModelPricing = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateModelPricingRequest) =>
      apiClient.createModelPricing(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.modelPricing });
    },
  });
};

export const useUpdateModelPricing = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      idOrModel,
      data,
    }: {
      idOrModel: string | number;
      data: UpdateModelPricingRequest;
    }) => apiClient.updateModelPricing(idOrModel, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.modelPricing });
    },
  });
};
