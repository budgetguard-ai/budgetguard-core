import { useState, useEffect } from "react";
import { apiClient } from "../services/api";
import type { Tenant, Budget, TagBudgetHealth } from "../types";

export interface BudgetAlert {
  id: string;
  type: "critical" | "warning" | "info";
  title: string;
  message: string;
  budget?: Budget;
  tagBudget?: TagBudgetHealth;
}

export interface BudgetHealthStatus {
  period: "daily" | "monthly" | "custom";
  budget: number;
  usage: number;
  percentage: number;
  status: "healthy" | "warning" | "critical";
  daysRemaining?: number;
  startDate?: string;
  endDate?: string;
}

export interface FinancialSummary {
  totalBudget: number;
  totalUsage: number;
  remainingBudget: number;
  budgetUtilization: number;
  activeBudgets: number;
  criticalBudgets: number;
}

interface UseBudgetHealthReturn {
  alerts: BudgetAlert[];
  budgetStatus: BudgetHealthStatus[];
  tagBudgetStatus: TagBudgetHealth[];
  financialSummary: FinancialSummary;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export const useBudgetHealth = (
  tenant: Tenant | null,
): UseBudgetHealthReturn => {
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [budgetStatus, setBudgetStatus] = useState<BudgetHealthStatus[]>([]);
  const [tagBudgetStatus, setTagBudgetStatus] = useState<TagBudgetHealth[]>([]);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary>({
    totalBudget: 0,
    totalUsage: 0,
    remainingBudget: 0,
    budgetUtilization: 0,
    activeBudgets: 0,
    criticalBudgets: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateBudgetStatus = (budgets: Budget[]): BudgetHealthStatus[] => {
    return budgets.map((budget) => {
      const budgetAmount = parseFloat(budget.amountUsd);
      const currentUsage = budget.currentUsage || 0;
      const percentage =
        budgetAmount > 0 ? (currentUsage / budgetAmount) * 100 : 0;

      let status: "healthy" | "warning" | "critical" = "healthy";
      if (percentage >= 90) status = "critical";
      else if (percentage >= 75) status = "warning";

      // Calculate days remaining for current period
      let daysRemaining: number | undefined;
      if (budget.currentPeriodEndDate) {
        const endDate = new Date(budget.currentPeriodEndDate);
        const now = new Date();
        daysRemaining = Math.ceil(
          (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
      }

      return {
        period: budget.period,
        budget: budgetAmount,
        usage: currentUsage,
        percentage,
        status,
        daysRemaining,
        startDate: budget.currentPeriodStartDate,
        endDate: budget.currentPeriodEndDate,
      };
    });
  };

  const generateAlerts = (
    budgetStatus: BudgetHealthStatus[],
    tagBudgets: TagBudgetHealth[],
  ): BudgetAlert[] => {
    const alerts: BudgetAlert[] = [];

    // Tenant budget alerts
    budgetStatus.forEach((status, index) => {
      if (status.status === "critical") {
        alerts.push({
          id: `budget-critical-${index}`,
          type: "critical",
          title: "Budget Exceeded",
          message: `${status.period} budget is at ${status.percentage.toFixed(1)}% utilization`,
        });
      } else if (status.status === "warning") {
        alerts.push({
          id: `budget-warning-${index}`,
          type: "warning",
          title: "Budget Warning",
          message: `${status.period} budget is at ${status.percentage.toFixed(1)}% utilization`,
        });
      }
    });

    // Tag budget alerts
    tagBudgets.forEach((tagBudget) => {
      if (tagBudget.status === "critical") {
        alerts.push({
          id: `tag-budget-critical-${tagBudget.budgetId}`,
          type: "critical",
          title: "Tag Budget Critical",
          message: `${tagBudget.tagName} tag exceeded ${tagBudget.percentage.toFixed(1)}% of ${tagBudget.period} budget`,
          tagBudget,
        });
      } else if (tagBudget.status === "warning") {
        alerts.push({
          id: `tag-budget-warning-${tagBudget.budgetId}`,
          type: "warning",
          title: "Tag Budget Warning",
          message: `${tagBudget.tagName} tag at ${tagBudget.percentage.toFixed(1)}% of ${tagBudget.period} budget`,
          tagBudget,
        });
      }
    });

    return alerts;
  };

  const calculateFinancialSummary = (
    budgetStatus: BudgetHealthStatus[],
    tagBudgets: TagBudgetHealth[],
  ): FinancialSummary => {
    const totalBudget = budgetStatus.reduce(
      (sum, budget) => sum + budget.budget,
      0,
    );
    const totalUsage = budgetStatus.reduce(
      (sum, budget) => sum + budget.usage,
      0,
    );
    const remainingBudget = totalBudget - totalUsage;
    const budgetUtilization =
      totalBudget > 0 ? (totalUsage / totalBudget) * 100 : 0;
    const activeBudgets = budgetStatus.length + tagBudgets.length;
    const criticalBudgets =
      budgetStatus.filter((b) => b.status === "critical").length +
      tagBudgets.filter((t) => t.status === "critical").length;

    return {
      totalBudget,
      totalUsage,
      remainingBudget,
      budgetUtilization,
      activeBudgets,
      criticalBudgets,
    };
  };

  const fetchBudgetHealth = async () => {
    if (!tenant) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch tenant budgets and tag analytics in parallel
      const [budgets, tagAnalytics] = await Promise.all([
        apiClient.getTenantBudgets(tenant.id),
        apiClient.getTagUsageAnalytics(tenant.id),
      ]);

      // Process budget status
      const budgetStatusData = calculateBudgetStatus(budgets);
      setBudgetStatus(budgetStatusData);

      // Set tag budget status
      setTagBudgetStatus(tagAnalytics.budgetHealth);

      // Generate alerts
      const alertsData = generateAlerts(
        budgetStatusData,
        tagAnalytics.budgetHealth,
      );
      setAlerts(alertsData);

      // Calculate financial summary
      const summary = calculateFinancialSummary(
        budgetStatusData,
        tagAnalytics.budgetHealth,
      );
      setFinancialSummary(summary);
    } catch (err) {
      console.error("Failed to fetch budget health:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load budget health data",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = () => {
    void fetchBudgetHealth();
  };

  useEffect(() => {
    if (tenant) {
      void fetchBudgetHealth();
    } else {
      // Reset state when no tenant selected
      setAlerts([]);
      setBudgetStatus([]);
      setTagBudgetStatus([]);
      setFinancialSummary({
        totalBudget: 0,
        totalUsage: 0,
        remainingBudget: 0,
        budgetUtilization: 0,
        activeBudgets: 0,
        criticalBudgets: 0,
      });
    }
  }, [tenant]);

  return {
    alerts,
    budgetStatus,
    tagBudgetStatus,
    financialSummary,
    isLoading,
    error,
    refresh,
  };
};
