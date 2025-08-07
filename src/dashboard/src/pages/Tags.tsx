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
} from "@mui/material";
import { useDashboardStore } from "../hooks/useStore";
import { useTenants } from "../hooks/useApi";
import TagMetricsCards from "../components/charts/TagMetricsCards";
import TagHierarchyTable from "../components/charts/TagHierarchyTable";
import TagDrilldownChart from "../components/charts/TagDrilldownChart";
import SunburstChart from "../components/charts/SunburstChart";
import type { TagAnalytics, TagUsageData } from "../types";

const Tags: React.FC = () => {
  const { selectedTenant, setSelectedTenant } = useDashboardStore();
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d");
  const [isLoading, setIsLoading] = useState(false);
  const [analytics, setAnalytics] = useState<TagAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drilldownTag, setDrilldownTag] = useState<TagUsageData | null>(null);

  const { data: tenants = [], isLoading: tenantsLoading } = useTenants();

  // Auto-select first tenant if none is selected
  useEffect(() => {
    if (!selectedTenant && tenants.length > 0 && !tenantsLoading) {
      setSelectedTenant(tenants[0]);
    }
  }, [tenants, selectedTenant, setSelectedTenant, tenantsLoading]);

  // Fetch tag analytics when tenant or time range changes
  useEffect(() => {
    const fetchTagAnalytics = async () => {
      if (!selectedTenant) return;

      setIsLoading(true);
      setError(null);

      try {
        // TODO: Replace with actual API call once backend endpoint is ready
        // const analytics = await apiClient.getTagUsageAnalytics(selectedTenant.id, {
        //   days: timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90,
        // });

        // Mock data for now with better hierarchy
        const mockAnalytics: TagAnalytics = {
          usage: [
            // Root tags
            {
              tagId: 1,
              tagName: "production",
              path: "production",
              usage: 185.5,
              requests: 4200,
              percentage: 52.1,
              color: "#FF6384",
            },
            {
              tagId: 2,
              tagName: "development",
              path: "development",
              usage: 98.3,
              requests: 2400,
              percentage: 27.6,
              color: "#36A2EB",
            },
            {
              tagId: 7,
              tagName: "testing",
              path: "testing",
              usage: 72.2,
              requests: 1590,
              percentage: 20.3,
              color: "#4BC0C0",
            },
            // Production children
            {
              tagId: 3,
              tagName: "api",
              path: "production/api",
              usage: 125.2,
              requests: 2800,
              percentage: 35.1,
              color: "#FFCE56",
            },
            {
              tagId: 4,
              tagName: "web",
              path: "production/web",
              usage: 40.3,
              requests: 950,
              percentage: 11.3,
              color: "#9966FF",
            },
            {
              tagId: 5,
              tagName: "worker",
              path: "production/worker",
              usage: 20.0,
              requests: 450,
              percentage: 5.6,
              color: "#FF9F40",
            },
            // API children (grandchildren)
            {
              tagId: 6,
              tagName: "v1",
              path: "production/api/v1",
              usage: 75.4,
              requests: 1680,
              percentage: 21.2,
              color: "#C9CBCF",
            },
            {
              tagId: 8,
              tagName: "v2",
              path: "production/api/v2",
              usage: 49.8,
              requests: 1120,
              percentage: 14.0,
              color: "#FF6B9D",
            },
            // Development children
            {
              tagId: 9,
              tagName: "feature-branch",
              path: "development/feature-branch",
              usage: 55.1,
              requests: 1350,
              percentage: 15.5,
              color: "#36D2EB",
            },
            {
              tagId: 10,
              tagName: "staging",
              path: "development/staging",
              usage: 43.2,
              requests: 1050,
              percentage: 12.1,
              color: "#A0D468",
            },
          ],
          budgetHealth: [
            {
              tagId: 1,
              tagName: "production",
              budgetId: 1,
              period: "monthly",
              budget: 200.0,
              usage: 125.5,
              percentage: 62.8,
              weight: 1.0,
              inheritanceMode: "STRICT",
              status: "warning",
            },
            {
              tagId: 1,
              tagName: "production",
              budgetId: 4,
              period: "daily",
              budget: 10.0,
              usage: 6.2,
              percentage: 62.0,
              weight: 1.0,
              inheritanceMode: "STRICT",
              status: "warning",
            },
            {
              tagId: 2,
              tagName: "development",
              budgetId: 2,
              period: "monthly",
              budget: 100.0,
              usage: 78.3,
              percentage: 78.3,
              weight: 1.0,
              inheritanceMode: "LENIENT",
              status: "warning",
            },
            {
              tagId: 7,
              tagName: "testing",
              budgetId: 3,
              period: "monthly",
              budget: 50.0,
              usage: 28.9,
              percentage: 57.8,
              weight: 1.0,
              inheritanceMode: "NONE",
              status: "healthy",
            },
            {
              tagId: 7,
              tagName: "testing",
              budgetId: 5,
              period: "daily",
              budget: 2.0,
              usage: 1.2,
              percentage: 60.0,
              weight: 1.0,
              inheritanceMode: "NONE",
              status: "warning",
            },
          ],
          trends: [],
          hierarchy: [
            {
              id: 1,
              name: "production",
              path: "production",
              usage: 170.7,
              budget: 200.0,
              children: [
                {
                  id: 3,
                  name: "api/v1",
                  path: "production/api/v1",
                  usage: 45.2,
                  children: [],
                },
              ],
            },
            {
              id: 2,
              name: "development",
              path: "development",
              usage: 78.3,
              budget: 100.0,
              children: [],
            },
            {
              id: 4,
              name: "testing",
              path: "testing",
              usage: 28.9,
              budget: 50.0,
              children: [],
            },
          ],
          totalUsage: 356.0,
          totalRequests: 8190,
          activeTags: 10,
          criticalBudgets: 0,
        };

        setAnalytics(mockAnalytics);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load tag analytics",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void fetchTagAnalytics();
  }, [selectedTenant, timeRange]);

  if (tenantsLoading) {
    return (
      <Box>
        <Typography
          variant="h5"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, mb: 3 }}
        >
          Tag Analytics
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
          Tag Analytics
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
          Tag Analytics
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
          Tag Analytics
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

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
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
              totalTenantUsage={400.0} // Mock total tenant usage including untagged
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
                totalBudgetUsage={400.0} // Mock total including untagged usage
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
