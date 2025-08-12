import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Grid,
  Button,
} from "@mui/material";
import { useDashboardStore } from "../hooks/useStore";
import { useTenants } from "../hooks/useApi";
import { apiClient } from "../services/api";
import { getDateRangeForRange } from "../utils/dateRange";
import TagMetricsCards from "../components/charts/TagMetricsCards";
import TagHierarchyTable from "../components/charts/TagHierarchyTable";
import TagDrilldownChart from "../components/charts/TagDrilldownChart";
import SunburstChart from "../components/charts/SunburstChart";
import type { TagAnalytics, TagUsageData } from "../types";

const Tags: React.FC = () => {
  const { selectedTenant, setSelectedTenant } = useDashboardStore();
  const [timeRange, setTimeRange] = useState<
    "1w" | "lw" | "1m" | "lm" | "7d" | "30d" | "90d"
  >("1m");
  const [isLoading, setIsLoading] = useState(false);
  const [analytics, setAnalytics] = useState<TagAnalytics | null>(null);
  const [totalTenantUsage, setTotalTenantUsage] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [drilldownTag, setDrilldownTag] = useState<TagUsageData | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const { data: tenants = [], isLoading: tenantsLoading } = useTenants();

  // Auto-select first tenant if none is selected
  useEffect(() => {
    if (!selectedTenant && tenants.length > 0 && !tenantsLoading) {
      setSelectedTenant(tenants[0]);
    }
  }, [tenants, selectedTenant, setSelectedTenant, tenantsLoading]);

  // Retry function
  const retryFetch = () => {
    setRetryCount((prev) => prev + 1);
  };

  // Reset retry count when tenant or time range changes
  useEffect(() => {
    setRetryCount(0);
  }, [selectedTenant, timeRange]);

  // Fetch tag analytics when tenant or time range changes
  useEffect(() => {
    const fetchTagAnalytics = async () => {
      if (!selectedTenant) {
        setAnalytics(null);
        return;
      }

      console.log(
        "Fetching analytics for tenant:",
        selectedTenant.name,
        selectedTenant.id,
        retryCount > 0 ? `(retry ${retryCount})` : "",
      );
      setIsLoading(true);
      setError(null);
      if (retryCount === 0) {
        setAnalytics(null); // Only clear data on first attempt, not retries
      }

      try {
        const dateRangeOptions = getDateRangeForRange(timeRange);

        // Fetch both tag analytics and model breakdown to get complete usage data
        const [analytics, modelBreakdown] = await Promise.all([
          apiClient.getTagUsageAnalytics(selectedTenant.id, dateRangeOptions),
          apiClient.getTenantModelBreakdown(
            selectedTenant.id,
            dateRangeOptions,
          ),
        ]);

        // Validate and transform the analytics data
        if (!analytics || typeof analytics !== "object") {
          throw new Error("Invalid analytics data received");
        }

        // Ensure required fields exist with default values
        const validatedAnalytics = {
          usage: analytics.usage || [],
          budgetHealth: analytics.budgetHealth || [],
          trends: analytics.trends || [],
          hierarchy: analytics.hierarchy || [],
          totalUsage: analytics.totalUsage || 0,
          totalRequests: analytics.totalRequests || 0,
          activeTags: analytics.activeTags || 0,
          criticalBudgets: analytics.criticalBudgets || 0,
        };

        // Calculate total tenant usage from model breakdown (includes untagged usage)
        const totalUsage = Array.isArray(modelBreakdown)
          ? modelBreakdown.reduce((sum, item) => sum + item.usage, 0)
          : 0;

        setAnalytics(validatedAnalytics);
        setTotalTenantUsage(totalUsage);
      } catch (err) {
        console.error("Failed to fetch tag analytics:", err);
        if (err instanceof Error) {
          setError(err.message);
        } else if (typeof err === "string") {
          setError(err);
        } else {
          setError("Failed to load tag analytics. Please try again.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    void fetchTagAnalytics();
  }, [selectedTenant, timeRange, retryCount]);

  if (tenantsLoading) {
    return (
      <Box>
        <Typography
          variant="h5"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, mb: 3 }}
        >
          Tags
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
          variant="h5"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, mb: 3 }}
        >
          Tags
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
          variant="h5"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, mb: 3 }}
        >
          Tags
        </Typography>
        <Alert severity="info">
          Please select a tenant to view tag analytics.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          Tags
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
                setTimeRange(
                  e.target.value as
                    | "1w"
                    | "lw"
                    | "1m"
                    | "lm"
                    | "7d"
                    | "30d"
                    | "90d",
                )
              }
            >
              <MenuItem value="1w">This week</MenuItem>
              <MenuItem value="lw">Last week</MenuItem>
              <MenuItem value="1m">This month</MenuItem>
              <MenuItem value="lm">Last month</MenuItem>
              <MenuItem value="7d">Last 7 days</MenuItem>
              <MenuItem value="30d">Last 30 days</MenuItem>
              <MenuItem value="90d">Last 90 days</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={retryFetch}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {!isLoading && analytics && (
        <>
          {/* Metrics Cards */}
          <Box sx={{ mb: 3 }}>
            <TagMetricsCards
              analytics={analytics}
              totalTenantUsage={totalTenantUsage}
            />
          </Box>

          {/* Charts and Tables */}
          <Grid container spacing={2}>
            {/* Hierarchical Sunburst Chart */}
            <Grid item xs={12} lg={drilldownTag ? 8 : 12}>
              <SunburstChart
                data={analytics.usage}
                title="Tag Usage Analytics"
                width={drilldownTag ? 600 : 800}
                height={500}
                totalBudgetUsage={totalTenantUsage}
              />
            </Grid>

            {/* Drill-down Chart when tag is selected */}
            {drilldownTag && (
              <Grid item xs={12} lg={4}>
                <TagDrilldownChart
                  parentTag={drilldownTag}
                  childTags={analytics.usage}
                  onClose={() => setDrilldownTag(null)}
                  onChildClick={(childTag) => setDrilldownTag(childTag)}
                />
              </Grid>
            )}
          </Grid>

          {/* Tag Usage Details Table */}
          <Box sx={{ mt: 3 }}>
            <TagHierarchyTable
              usageData={analytics.usage}
              budgetHealth={analytics.budgetHealth}
              title="Tag Usage & Budget Details"
            />
          </Box>

          {analytics.usage.length === 0 && (
            <Box sx={{ mt: 4 }}>
              <Alert severity="info">
                No tag usage data available for this tenant. Tags will appear
                here once API requests with tag headers are made.
              </Alert>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default Tags;
