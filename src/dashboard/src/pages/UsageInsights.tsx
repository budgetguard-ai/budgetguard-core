import React, { useState } from "react";
import {
  Box,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { useDashboardStore } from "../hooks/useStore";
import { useTenants } from "../hooks/useApi";
import { useUsageInsights } from "../hooks/useUsageInsights";
import DashboardPageLayout from "../components/layout/DashboardPageLayout";
import LoadingSpinner from "../components/common/LoadingSpinner";
import ErrorAlert from "../components/common/ErrorAlert";
import EmptyState from "../components/common/EmptyState";
import TimeRangeSelector, {
  TimeRangeOption,
} from "../components/common/TimeRangeSelector";
import UsageSummaryGrid from "../components/usage/UsageSummaryGrid";
import UsageTrendChart from "../components/charts/UsageTrendChart";
import ModelBreakdownChart from "../components/charts/ModelBreakdownChart";
import TagHierarchyVisualization from "../components/tag/TagHierarchyVisualization";
import TagHierarchyTable from "../components/charts/TagHierarchyTable";
import { TIME_RANGE_OPTIONS } from "../components/common/TimeRangeSelector";

const UsageInsights: React.FC = () => {
  const { selectedTenant, setSelectedTenant } = useDashboardStore();
  const { data: tenants = [], isLoading: tenantsLoading } = useTenants();
  const [timeRange, setTimeRange] = useState<TimeRangeOption>("1m");

  const {
    summary,
    modelBreakdown,
    usageTrend,
    tagUsage,
    tagBudgetHealth,
    isLoading,
    error,
    refresh,
  } = useUsageInsights(selectedTenant, timeRange);

  // Auto-select first tenant if none is selected
  React.useEffect(() => {
    if (!selectedTenant && tenants.length > 0 && !tenantsLoading) {
      setSelectedTenant(tenants[0]);
    }
  }, [tenants, selectedTenant, setSelectedTenant, tenantsLoading]);

  if (tenantsLoading) {
    return (
      <DashboardPageLayout title="Usage Insights">
        <LoadingSpinner message="Loading tenants..." />
      </DashboardPageLayout>
    );
  }

  if (tenants.length === 0) {
    return (
      <DashboardPageLayout title="Usage Insights">
        <EmptyState
          title="No Tenants Found"
          message="Please create a tenant first in the Tenant Management page to view usage insights."
        />
      </DashboardPageLayout>
    );
  }

  const timeRangeLabel =
    TIME_RANGE_OPTIONS.find((opt) => opt.value === timeRange)?.label ||
    timeRange;

  const pageActions = (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel>Select Tenant</InputLabel>
        <Select
          value={selectedTenant?.id || ""}
          label="Select Tenant"
          onChange={(e) => {
            const tenant = tenants.find((t) => t.id === Number(e.target.value));
            setSelectedTenant(tenant || null);
          }}
        >
          {tenants.map((tenant) => (
            <MenuItem key={tenant.id} value={tenant.id}>
              {tenant.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TimeRangeSelector
        value={timeRange}
        onChange={setTimeRange}
        minWidth={140}
      />
    </Box>
  );

  if (!selectedTenant) {
    return (
      <DashboardPageLayout
        title="Usage Insights"
        subtitle="Understand AI usage patterns and optimize operations"
        actions={pageActions}
      >
        <EmptyState
          title="Select a Tenant"
          message="Please select a tenant to view usage insights."
        />
      </DashboardPageLayout>
    );
  }

  if (error) {
    return (
      <DashboardPageLayout
        title="Usage Insights"
        subtitle="Understand AI usage patterns and optimize operations"
        actions={pageActions}
      >
        <ErrorAlert error={error} onRetry={refresh} />
      </DashboardPageLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardPageLayout
        title="Usage Insights"
        subtitle="Understand AI usage patterns and optimize operations"
        actions={pageActions}
      >
        <LoadingSpinner message="Loading usage insights..." />
      </DashboardPageLayout>
    );
  }

  const hasUsageData = summary.totalUsage > 0 || summary.totalRequests > 0;

  return (
    <DashboardPageLayout
      title="Usage Insights"
      subtitle="Understand AI usage patterns and optimize operations"
      actions={pageActions}
    >
      {/* Usage Summary */}
      <Box sx={{ mb: 3 }}>
        <UsageSummaryGrid
          summary={summary}
          isLoading={isLoading}
          timeRangeLabel={timeRangeLabel}
        />
      </Box>

      {hasUsageData ? (
        <Grid container spacing={3}>
          {/* Usage Trend Chart */}
          <Grid item xs={12}>
            <UsageTrendChart
              data={{
                labels: usageTrend.map((point) =>
                  new Date(point.date).toLocaleDateString(),
                ),
                datasets: [
                  {
                    label: "Usage",
                    data: usageTrend.map((point) => point.usage),
                    color: "#1976d2",
                  },
                ],
              }}
              title={`Usage Trend (${timeRangeLabel})`}
              height={300}
            />
          </Grid>

          {/* Model Breakdown - Full Width */}
          <Grid item xs={12}>
            <ModelBreakdownChart
              data={modelBreakdown.map((model, index) => ({
                ...model,
                color: `hsl(${(index * 360) / modelBreakdown.length}, 70%, 50%)`,
              }))}
              title="Usage by Model"
              height={400}
            />
          </Grid>

          {/* Tag Hierarchy Visualization - Full Width */}
          {tagUsage.length > 0 && (
            <Grid item xs={12}>
              <TagHierarchyVisualization
                tagUsage={tagUsage}
                totalTenantUsage={summary.totalUsage}
                timeRangeLabel={timeRangeLabel}
                title="Tag Hierarchy Visualization"
              />
            </Grid>
          )}

          {/* Tag Usage & Budget Details */}
          {tagUsage.length > 0 && (
            <Grid item xs={12}>
              <TagHierarchyTable
                usageData={tagUsage}
                budgetHealth={tagBudgetHealth}
                title="Tag Usage & Budget Details"
              />
            </Grid>
          )}
        </Grid>
      ) : (
        <Box sx={{ mt: 4 }}>
          <EmptyState
            title="No Usage Data"
            message="No usage data available for the selected time period. Usage insights will appear here once API requests are made."
          />
        </Box>
      )}
    </DashboardPageLayout>
  );
};

export default UsageInsights;
