import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Alert,
  CircularProgress,
} from "@mui/material";
import {
  TrendingUp as TrendingUpIcon,
  AccountBalanceWallet as WalletIcon,
  Assessment as AssessmentIcon,
  Timeline as TimelineIcon,
} from "@mui/icons-material";
import BudgetVsUsageChart from "../components/charts/BudgetVsUsageChart";
import UsageTrendChart from "../components/charts/UsageTrendChart";
import ModelBreakdownChart from "../components/charts/ModelBreakdownChart";
import BudgetHealthIndicator from "../components/charts/BudgetHealthIndicator";
import { useUsageAnalytics } from "../hooks/useUsageAnalytics";
import { useDashboardStore } from "../hooks/useStore";
import { useTenants } from "../hooks/useApi";

const Usage: React.FC = () => {
  const { selectedTenant, setSelectedTenant } = useDashboardStore();
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d");
  const { data: tenants = [], isLoading: tenantsLoading } = useTenants();
  const { data, isLoading, rawUsageData } = useUsageAnalytics(
    selectedTenant,
    timeRange,
  );

  // Auto-select first tenant if none is selected and tenants are available
  useEffect(() => {
    if (!selectedTenant && tenants.length > 0 && !tenantsLoading) {
      setSelectedTenant(tenants[0]);
    }
  }, [tenants, selectedTenant, setSelectedTenant, tenantsLoading]);

  if (tenantsLoading) {
    return (
      <Box>
        <Typography
          variant="h4"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, mb: 4 }}
        >
          Usage Analytics
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (tenants.length === 0) {
    return (
      <Box>
        <Typography
          variant="h4"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, mb: 4 }}
        >
          Usage Analytics
        </Typography>
        <Alert severity="info">
          No tenants found. Please create a tenant first in the Tenant
          Management page.
        </Alert>
      </Box>
    );
  }

  if (!selectedTenant) {
    return (
      <Box>
        <Typography
          variant="h4"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, mb: 4 }}
        >
          Usage Analytics
        </Typography>
        <Alert severity="info">
          Please select a tenant to view usage analytics.
        </Alert>
      </Box>
    );
  }

  const totalUsage = Object.values(
    rawUsageData as Record<string, number>,
  ).reduce((sum: number, val: number) => sum + val, 0);
  const activeBudgets = data.budgetHealth.length;
  const criticalBudgets = data.budgetHealth.filter(
    (b) => b.status === "critical",
  ).length;

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 4,
        }}
      >
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Usage Analytics
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Select Tenant</InputLabel>
            <Select
              value={selectedTenant?.id || ""}
              label="Select Tenant"
              onChange={(e) => {
                const tenant = tenants.find(
                  (t) => t.id === Number(e.target.value),
                );
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
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Time Range</InputLabel>
            <Select
              value={timeRange}
              label="Time Range"
              onChange={(e) =>
                setTimeRange(e.target.value as "7d" | "30d" | "90d")
              }
            >
              <MenuItem value="7d">Last 7 days</MenuItem>
              <MenuItem value="30d">Last 30 days</MenuItem>
              <MenuItem value="90d">Last 90 days</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* Loading state for analytics */}
      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Content */}
      {!isLoading && (
        <>
          {/* Summary Cards */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <TrendingUpIcon color="primary" sx={{ fontSize: 40 }} />
                    <Box>
                      <Typography variant="h4" color="primary">
                        ${totalUsage.toFixed(2)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Usage
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <AssessmentIcon color="success" sx={{ fontSize: 40 }} />
                    <Box>
                      <Typography variant="h4" color="success.main">
                        {activeBudgets}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Active Budgets
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <TimelineIcon color="warning" sx={{ fontSize: 40 }} />
                    <Box>
                      <Typography variant="h4" color="warning.main">
                        {data.modelBreakdown.length}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Models Used
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <WalletIcon
                      color={criticalBudgets > 0 ? "error" : "success"}
                      sx={{ fontSize: 40 }}
                    />
                    <Box>
                      <Typography
                        variant="h4"
                        color={
                          criticalBudgets > 0 ? "error.main" : "success.main"
                        }
                      >
                        {criticalBudgets}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Critical Budgets
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Budget Health Indicators */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12}>
              <BudgetHealthIndicator budgets={data.budgetHealth} />
            </Grid>
          </Grid>

          {/* Charts */}
          <Grid container spacing={3}>
            {/* Daily Budget Chart */}
            {data.separatedBudgets.daily.labels.length > 0 && (
              <Grid item xs={12} md={6}>
                <BudgetVsUsageChart
                  data={data.separatedBudgets.daily}
                  title="Daily Budget vs Usage"
                  height={300}
                />
              </Grid>
            )}

            {/* Monthly Budget Chart */}
            {data.separatedBudgets.monthly.labels.length > 0 && (
              <Grid item xs={12} md={6}>
                <BudgetVsUsageChart
                  data={data.separatedBudgets.monthly}
                  title="Monthly Budget vs Usage"
                  height={300}
                />
              </Grid>
            )}

            {/* Custom Budget Chart (only if exists) */}
            {data.separatedBudgets.custom.labels.length > 0 && (
              <Grid item xs={12} md={6}>
                <BudgetVsUsageChart
                  data={data.separatedBudgets.custom}
                  title="Custom Budget vs Usage"
                  height={300}
                />
              </Grid>
            )}

            {/* Model Breakdown Chart */}
            <Grid item xs={12} md={6}>
              <ModelBreakdownChart
                data={data.modelBreakdown}
                title="Usage by Model"
                height={300}
              />
            </Grid>

            {/* Usage Trend Chart */}
            <Grid item xs={12}>
              <UsageTrendChart
                data={data.usageTrend}
                title={`Usage Trend (${timeRange})`}
                height={300}
              />
            </Grid>
          </Grid>

          {Object.keys(rawUsageData).length === 0 && (
            <Box sx={{ mt: 4 }}>
              <Alert severity="info">
                No usage data available for this tenant. Usage will appear here
                once API requests are made.
              </Alert>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default Usage;
