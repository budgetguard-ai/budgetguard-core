import { useState, useEffect } from "react";
import { apiClient } from "../services/api";
import { getDateRangeForRange } from "../utils/dateRange";
import type {
  Tenant,
  TagAnalytics,
  TagUsageData,
  TagBudgetHealth,
} from "../types";
import type { TimeRangeOption } from "../components/common/TimeRangeSelector";

export interface UsageSummary {
  totalUsage: number;
  totalRequests: number;
  modelsUsed: number;
  avgCostPerRequest: number;
  activeTags: number;
  taggedUsage: number;
  untaggedUsage: number;
  tagCoverage: number; // percentage of usage that is tagged
}

export interface ModelUsageData {
  model: string;
  usage: number;
  percentage: number;
  provider?: string;
}

export interface UsageTrendPoint {
  date: string;
  usage: number;
  requests?: number;
}

export interface TopUsageItem {
  id: string;
  type: "model" | "tag" | "route";
  name: string;
  usage: number;
  requests: number;
  percentage: number;
}

interface UseUsageInsightsReturn {
  summary: UsageSummary;
  modelBreakdown: ModelUsageData[];
  usageTrend: UsageTrendPoint[];
  tagUsage: TagUsageData[];
  tagBudgetHealth: TagBudgetHealth[];
  topUsage: TopUsageItem[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export const useUsageInsights = (
  tenant: Tenant | null,
  timeRange: TimeRangeOption,
): UseUsageInsightsReturn => {
  const [summary, setSummary] = useState<UsageSummary>({
    totalUsage: 0,
    totalRequests: 0,
    modelsUsed: 0,
    avgCostPerRequest: 0,
    activeTags: 0,
    taggedUsage: 0,
    untaggedUsage: 0,
    tagCoverage: 0,
  });
  const [modelBreakdown, setModelBreakdown] = useState<ModelUsageData[]>([]);
  const [usageTrend, setUsageTrend] = useState<UsageTrendPoint[]>([]);
  const [tagUsage, setTagUsage] = useState<TagUsageData[]>([]);
  const [tagBudgetHealth, setTagBudgetHealth] = useState<TagBudgetHealth[]>([]);
  const [topUsage, setTopUsage] = useState<TopUsageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processUsageData = (
    modelBreakdownData: ModelUsageData[],
    tagAnalytics: TagAnalytics,
  ) => {
    // Calculate total usage from model breakdown
    const totalUsage = modelBreakdownData.reduce(
      (sum, item) => sum + item.usage,
      0,
    );

    // Calculate summary metrics
    const summaryData: UsageSummary = {
      totalUsage,
      totalRequests: tagAnalytics.totalRequests,
      modelsUsed: modelBreakdownData.length,
      avgCostPerRequest:
        tagAnalytics.totalRequests > 0
          ? totalUsage / tagAnalytics.totalRequests
          : 0,
      activeTags: tagAnalytics.activeTags,
      taggedUsage: tagAnalytics.totalUsage,
      untaggedUsage: Math.max(0, totalUsage - tagAnalytics.totalUsage),
      tagCoverage:
        totalUsage > 0 ? (tagAnalytics.totalUsage / totalUsage) * 100 : 0,
    };

    // Create top usage items combining models and tags
    const topUsageItems: TopUsageItem[] = [
      // Top models
      ...modelBreakdownData.slice(0, 5).map((model, index) => ({
        id: `model-${index}`,
        type: "model" as const,
        name: model.model,
        usage: model.usage,
        requests: Math.round(
          tagAnalytics.totalRequests * (model.percentage / 100),
        ), // Estimate
        percentage: model.percentage,
      })),
      // Top tags
      ...tagAnalytics.usage.slice(0, 5).map((tag, index) => ({
        id: `tag-${index}`,
        type: "tag" as const,
        name: tag.tagName,
        usage: tag.usage,
        requests: tag.requests,
        percentage: tag.percentage,
      })),
    ];

    // Sort by usage and take top 10
    const sortedTopUsage = topUsageItems
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10);

    setSummary(summaryData);
    setTopUsage(sortedTopUsage);
  };

  const fetchUsageInsights = async () => {
    if (!tenant) return;

    setIsLoading(true);
    setError(null);

    try {
      const dateRangeOptions = getDateRangeForRange(timeRange);

      // Fetch all usage data in parallel
      const [modelBreakdownData, tagAnalytics, usageHistoryData] =
        await Promise.all([
          apiClient.getTenantModelBreakdown(tenant.id, dateRangeOptions),
          apiClient.getTagUsageAnalytics(tenant.id, dateRangeOptions),
          apiClient.getTenantUsageHistory(tenant.id, dateRangeOptions),
        ]);

      // Set individual data
      setModelBreakdown(modelBreakdownData);
      setTagUsage(tagAnalytics.usage);
      setTagBudgetHealth(tagAnalytics.budgetHealth);
      setUsageTrend(usageHistoryData);

      // Process and set summary data
      processUsageData(modelBreakdownData, tagAnalytics);
    } catch (err) {
      console.error("Failed to fetch usage insights:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load usage insights data",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = () => {
    void fetchUsageInsights();
  };

  useEffect(() => {
    if (tenant) {
      void fetchUsageInsights();
    } else {
      // Reset state when no tenant selected
      setSummary({
        totalUsage: 0,
        totalRequests: 0,
        modelsUsed: 0,
        avgCostPerRequest: 0,
        activeTags: 0,
        taggedUsage: 0,
        untaggedUsage: 0,
        tagCoverage: 0,
      });
      setModelBreakdown([]);
      setUsageTrend([]);
      setTagUsage([]);
      setTagBudgetHealth([]);
      setTopUsage([]);
    }
  }, [tenant, timeRange]);

  return {
    summary,
    modelBreakdown,
    usageTrend,
    tagUsage,
    tagBudgetHealth,
    topUsage,
    isLoading,
    error,
    refresh,
  };
};
