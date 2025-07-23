import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../services/api";
import type {
  Budget,
  CreateTenantRequest,
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
    },
  });
};

export const useDeleteBudget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (budgetId: number) => apiClient.deleteBudget(budgetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
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
