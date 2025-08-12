import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiClient } from "../services/api";
import type { Tenant } from "../types";

interface ModelUsageData {
  model: string;
  usage: number;
  percentage: number;
  color: string;
}

interface BudgetHealth {
  period: string;
  budget: number;
  usage: number;
  percentage: number;
  status: "healthy" | "warning" | "critical";
  daysRemaining?: number;
}

interface BudgetVsUsageData {
  labels: string[];
  usage: number[];
  budgets: number[];
}

interface SeparatedBudgetData {
  daily: BudgetVsUsageData;
  monthly: BudgetVsUsageData;
  custom: BudgetVsUsageData;
}

interface UsageTrendData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color: string;
  }>;
}

const MODEL_COLORS = [
  "#FF6384",
  "#36A2EB",
  "#FFCE56",
  "#4BC0C0",
  "#9966FF",
  "#FF9F40",
  "#FF6384",
  "#C9CBCF",
];

export const useUsageAnalytics = (
  tenant: Tenant | null,
  timeRange: "1w" | "lw" | "1m" | "lm" | "7d" | "30d" | "90d" = "30d",
) => {
  // Fetch usage data
  const { data: usageData = {}, isLoading: usageLoading } = useQuery({
    queryKey: ["tenant-usage", tenant?.id],
    queryFn: () =>
      tenant ? apiClient.getTenantUsage(tenant.id) : Promise.resolve({}),
    enabled: !!tenant,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Calculate date range for API calls
  const getDateRangeForRange = (range: string) => {
    const now = new Date();

    switch (range) {
      case "1w": {
        // This week: from Sunday to today
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay()); // Go to Sunday
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(now);
        endOfWeek.setHours(23, 59, 59, 999);

        return {
          startDate:
            startOfWeek.getFullYear() +
            "-" +
            String(startOfWeek.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(startOfWeek.getDate()).padStart(2, "0"),
          endDate:
            endOfWeek.getFullYear() +
            "-" +
            String(endOfWeek.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(endOfWeek.getDate()).padStart(2, "0"),
        };
      }
      case "lw": {
        // Last week: complete Sunday-Saturday week
        const startOfLastWeek = new Date(now);
        startOfLastWeek.setDate(now.getDate() - now.getDay() - 7); // Go to last Sunday
        startOfLastWeek.setHours(0, 0, 0, 0);
        const endOfLastWeek = new Date(startOfLastWeek);
        endOfLastWeek.setDate(startOfLastWeek.getDate() + 6); // Go to Saturday
        endOfLastWeek.setHours(23, 59, 59, 999);

        return {
          startDate:
            startOfLastWeek.getFullYear() +
            "-" +
            String(startOfLastWeek.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(startOfLastWeek.getDate()).padStart(2, "0"),
          endDate:
            endOfLastWeek.getFullYear() +
            "-" +
            String(endOfLastWeek.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(endOfLastWeek.getDate()).padStart(2, "0"),
        };
      }
      case "1m": {
        // This month: from 1st of current month to today
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now);
        endOfMonth.setHours(23, 59, 59, 999);

        return {
          startDate:
            startOfMonth.getFullYear() +
            "-" +
            String(startOfMonth.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(startOfMonth.getDate()).padStart(2, "0"),
          endDate:
            endOfMonth.getFullYear() +
            "-" +
            String(endOfMonth.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(endOfMonth.getDate()).padStart(2, "0"),
        };
      }
      case "lm": {
        // Last month: complete previous month
        const startOfLastMonth = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1,
        );
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
        endOfLastMonth.setHours(23, 59, 59, 999);

        return {
          startDate:
            startOfLastMonth.getFullYear() +
            "-" +
            String(startOfLastMonth.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(startOfLastMonth.getDate()).padStart(2, "0"),
          endDate:
            endOfLastMonth.getFullYear() +
            "-" +
            String(endOfLastMonth.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(endOfLastMonth.getDate()).padStart(2, "0"),
        };
      }
      case "7d":
        return { days: 7 };
      case "30d":
        return { days: 30 };
      case "90d":
        return { days: 90 };
      default:
        return { days: 30 };
    }
  };

  const dateRangeOptions = getDateRangeForRange(timeRange);

  const { data: historicalUsage = [], isLoading: historicalLoading } = useQuery(
    {
      queryKey: ["tenant-usage-history", tenant?.id, timeRange],
      queryFn: () =>
        tenant
          ? apiClient.getTenantUsageHistory(tenant.id, dateRangeOptions)
          : Promise.resolve([]),
      enabled: !!tenant,
      refetchInterval: 60000, // Refetch every minute
    },
  );

  // Fetch model breakdown data
  const { data: modelBreakdown = [], isLoading: modelLoading } = useQuery({
    queryKey: ["tenant-model-breakdown", tenant?.id, timeRange],
    queryFn: () =>
      tenant
        ? apiClient.getTenantModelBreakdown(tenant.id, dateRangeOptions)
        : Promise.resolve([]),
    enabled: !!tenant,
    refetchInterval: 60000, // Refetch every minute
  });

  // Fetch budget data
  const { data: budgets = [], isLoading: budgetsLoading } = useQuery({
    queryKey: ["tenant-budgets", tenant?.id],
    queryFn: () =>
      tenant ? apiClient.getTenantBudgets(tenant.id) : Promise.resolve([]),
    enabled: !!tenant,
  });

  // Process data for charts
  const chartData = useMemo(() => {
    if (!tenant) {
      return {
        budgetVsUsage: {
          labels: [],
          usage: [],
          budgets: [],
        } as BudgetVsUsageData,
        separatedBudgets: {
          daily: { labels: [], usage: [], budgets: [] },
          monthly: { labels: [], usage: [], budgets: [] },
          custom: { labels: [], usage: [], budgets: [] },
        } as SeparatedBudgetData,
        modelBreakdown: [] as ModelUsageData[],
        budgetHealth: [] as BudgetHealth[],
        usageTrend: { labels: [], datasets: [] } as UsageTrendData,
      };
    }

    // Use actual usage data from API
    const currentUsageData = usageData;

    // Budget vs Usage Chart Data (combined - for compatibility)
    const budgetVsUsage: BudgetVsUsageData = {
      labels: Object.keys(currentUsageData),
      usage: Object.values(currentUsageData),
      budgets: Object.keys(currentUsageData).map((period) => {
        const budget = budgets.find((b) => b.period === period);
        return budget ? parseFloat(budget.amountUsd) : 0;
      }),
    };

    // Separated Budget Data by Period
    const currentData = currentUsageData as Record<string, number>;
    const separatedBudgets: SeparatedBudgetData = {
      daily: {
        labels: currentData.daily !== undefined ? ["Daily"] : [],
        usage: currentData.daily !== undefined ? [currentData.daily] : [],
        budgets:
          currentData.daily !== undefined
            ? [
                (() => {
                  const dailyBudget = budgets.find((b) => b.period === "daily");
                  return dailyBudget ? parseFloat(dailyBudget.amountUsd) : 0;
                })(),
              ]
            : [],
      },
      monthly: {
        labels: currentData.monthly !== undefined ? ["Monthly"] : [],
        usage: currentData.monthly !== undefined ? [currentData.monthly] : [],
        budgets:
          currentData.monthly !== undefined
            ? [
                (() => {
                  const monthlyBudget = budgets.find(
                    (b) => b.period === "monthly",
                  );
                  return monthlyBudget
                    ? parseFloat(monthlyBudget.amountUsd)
                    : 0;
                })(),
              ]
            : [],
      },
      custom: {
        labels:
          currentData.custom !== undefined && currentData.custom > 0
            ? ["Custom"]
            : [],
        usage:
          currentData.custom !== undefined && currentData.custom > 0
            ? [currentData.custom]
            : [],
        budgets:
          currentData.custom !== undefined && currentData.custom > 0
            ? [
                (() => {
                  const customBudget = budgets.find(
                    (b) => b.period === "custom",
                  );
                  return customBudget ? parseFloat(customBudget.amountUsd) : 0;
                })(),
              ]
            : [],
      },
    };

    // Model Breakdown (real data from API)
    const modelBreakdownData: ModelUsageData[] = modelBreakdown.map(
      (item, index) => ({
        model: item.model,
        usage: item.usage,
        percentage: item.percentage,
        color: MODEL_COLORS[index % MODEL_COLORS.length],
      }),
    );

    // Budget Health Indicators
    const budgetHealth: BudgetHealth[] = Object.keys(currentUsageData).map(
      (period) => {
        const usage = (currentUsageData as Record<string, number>)[period];
        const budget = budgets.find((b) => b.period === period);
        const budgetAmount = budget ? parseFloat(budget.amountUsd) : 0;
        const percentage = budgetAmount > 0 ? (usage / budgetAmount) * 100 : 0;

        let status: "healthy" | "warning" | "critical" = "healthy";
        if (percentage >= 90) status = "critical";
        else if (percentage >= 75) status = "warning";

        // Calculate days remaining for monthly/daily budgets
        let daysRemaining: number | undefined;
        if (period === "monthly") {
          const now = new Date();
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          daysRemaining = Math.ceil(
            (endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          );
        } else if (period === "daily") {
          daysRemaining = 1;
        }

        return {
          period,
          budget: budgetAmount,
          usage,
          percentage,
          status,
          daysRemaining,
        };
      },
    );

    // Usage Trend (real historical data from UsageLedger)
    const usageTrend: UsageTrendData = {
      labels: historicalUsage.map((entry) => {
        const date = new Date(entry.date);
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      }),
      datasets: [
        {
          label: "Daily Usage",
          data: historicalUsage.map((entry) => entry.usage),
          color: "#36A2EB",
        },
      ],
    };

    return {
      budgetVsUsage,
      separatedBudgets,
      modelBreakdown: modelBreakdownData,
      budgetHealth,
      usageTrend,
    };
  }, [usageData, budgets, tenant, timeRange, historicalUsage, modelBreakdown]);

  return {
    data: chartData,
    isLoading:
      usageLoading || budgetsLoading || historicalLoading || modelLoading,
    rawUsageData: usageData,
    budgets,
    tenant,
  };
};
