import React from "react";
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
import { useBudgetHealth } from "../hooks/useBudgetHealth";
import DashboardPageLayout from "../components/layout/DashboardPageLayout";
import LoadingSpinner from "../components/common/LoadingSpinner";
import ErrorAlert from "../components/common/ErrorAlert";
import EmptyState from "../components/common/EmptyState";
import BudgetAlertBanner from "../components/budget/BudgetAlertBanner";
import BudgetStatusGrid from "../components/budget/BudgetStatusGrid";
import BudgetUsageChart from "../components/budget/BudgetUsageChart";
import TagBudgetHealthGrid from "../components/tag/TagBudgetHealthGrid";

const BudgetHealth: React.FC = () => {
  const { selectedTenant, setSelectedTenant } = useDashboardStore();
  const { data: tenants = [], isLoading: tenantsLoading } = useTenants();
  const { alerts, budgetStatus, tagBudgetStatus, isLoading, error, refresh } =
    useBudgetHealth(selectedTenant);

  // Auto-select first tenant if none is selected
  React.useEffect(() => {
    if (!selectedTenant && tenants.length > 0 && !tenantsLoading) {
      setSelectedTenant(tenants[0]);
    }
  }, [tenants, selectedTenant, setSelectedTenant, tenantsLoading]);

  if (tenantsLoading) {
    return (
      <DashboardPageLayout title="Budget Health">
        <LoadingSpinner message="Loading tenants..." />
      </DashboardPageLayout>
    );
  }

  if (tenants.length === 0) {
    return (
      <DashboardPageLayout title="Budget Health">
        <EmptyState
          title="No Tenants Found"
          message="Please create a tenant first in the Tenant Management page to view budget health information."
        />
      </DashboardPageLayout>
    );
  }

  const pageActions = (
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
  );

  if (!selectedTenant) {
    return (
      <DashboardPageLayout
        title="Budget Health"
        subtitle="Monitor spending limits and financial health"
        actions={pageActions}
      >
        <EmptyState
          title="Select a Tenant"
          message="Please select a tenant to view budget health information."
        />
      </DashboardPageLayout>
    );
  }

  if (error) {
    return (
      <DashboardPageLayout
        title="Budget Health"
        subtitle="Monitor spending limits and financial health"
        actions={pageActions}
      >
        <ErrorAlert error={error} onRetry={refresh} />
      </DashboardPageLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardPageLayout
        title="Budget Health"
        subtitle="Monitor spending limits and financial health"
        actions={pageActions}
      >
        <LoadingSpinner message="Loading budget health data..." />
      </DashboardPageLayout>
    );
  }

  return (
    <DashboardPageLayout
      title="Budget Health"
      subtitle="Monitor spending limits and financial health"
      actions={pageActions}
    >
      {/* Critical Alerts */}
      <BudgetAlertBanner alerts={alerts} dismissible />

      {/* Main Content Grid */}
      <Grid container spacing={3}>
        {/* Budget Status Cards */}
        <Grid item xs={12}>
          <BudgetStatusGrid
            budgetStatus={budgetStatus}
            isLoading={isLoading}
            title="Current Budget Status"
          />
        </Grid>

        {/* Daily Budget Chart */}
        {budgetStatus.filter((b) => b.period === "daily").length > 0 && (
          <Grid item xs={12} md={6}>
            <BudgetUsageChart
              budgetStatus={budgetStatus.filter((b) => b.period === "daily")}
              title="Daily Budget Overview"
            />
          </Grid>
        )}

        {/* Monthly Budget Chart */}
        {budgetStatus.filter((b) => b.period === "monthly").length > 0 && (
          <Grid item xs={12} md={6}>
            <BudgetUsageChart
              budgetStatus={budgetStatus.filter((b) => b.period === "monthly")}
              title="Monthly Budget Overview"
            />
          </Grid>
        )}

        {/* Custom Budget Chart */}
        {budgetStatus.filter((b) => b.period === "custom").length > 0 && (
          <Grid item xs={12} md={6}>
            <BudgetUsageChart
              budgetStatus={budgetStatus.filter((b) => b.period === "custom")}
              title="Custom Budget Overview"
            />
          </Grid>
        )}

        {/* Tag Budget Health */}
        {tagBudgetStatus.length > 0 && (
          <Grid item xs={12}>
            <TagBudgetHealthGrid
              tagBudgets={tagBudgetStatus}
              title="Tag Budget Health"
            />
          </Grid>
        )}
      </Grid>

      {/* No Data State */}
      {budgetStatus.length === 0 && tagBudgetStatus.length === 0 && (
        <Box sx={{ mt: 4 }}>
          <EmptyState
            title="No Budget Data"
            message="Configure daily or monthly budgets to start monitoring your AI spending and get alerts when limits are approached."
          />
        </Box>
      )}
    </DashboardPageLayout>
  );
};

export default BudgetHealth;
