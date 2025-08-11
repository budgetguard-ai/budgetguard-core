import React from "react";
import { Box, Typography, Card, CardContent, Grid } from "@mui/material";
import {
  LocalOffer as TagIcon,
  TrendingUp as TrendingUpIcon,
  Assessment as RequestIcon,
  Warning as WarningIcon,
  MonetizationOn as CostIcon,
} from "@mui/icons-material";
import { formatCurrency } from "../../utils/currency";
import type { TagAnalytics } from "../../types";

interface TagMetricsCardsProps {
  analytics: TagAnalytics;
  totalTenantUsage?: number; // Total usage including untagged
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactElement;
  color?: "primary" | "success" | "warning" | "error" | "info";
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color = "primary",
  trend,
}) => {
  return (
    <Card>
      <CardContent sx={{ p: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ color: `${color}.main` }}>
            {React.cloneElement(icon, { sx: { fontSize: 28 } })}
          </Box>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" color={`${color}.main`} noWrap>
              {typeof value === "number" ? value.toLocaleString() : value}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {subtitle}
              </Typography>
            )}
            {trend && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  mt: 0.5,
                }}
              >
                <TrendingUpIcon
                  sx={{
                    fontSize: 14,
                    color: trend.isPositive ? "success.main" : "error.main",
                    transform: trend.isPositive ? "none" : "rotate(180deg)",
                  }}
                />
                <Typography
                  variant="caption"
                  color={trend.isPositive ? "success.main" : "error.main"}
                >
                  {trend.isPositive ? "+" : ""}
                  {trend.value.toFixed(1)}%
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

const TagMetricsCards: React.FC<TagMetricsCardsProps> = ({
  analytics,
  totalTenantUsage,
}) => {
  // Calculate tagged vs untagged usage
  const taggedUsage = analytics.totalUsage;
  const actualTotalUsage = totalTenantUsage || taggedUsage;
  const untaggedUsage = Math.max(0, actualTotalUsage - taggedUsage);

  const avgCostPerRequest =
    analytics.totalRequests > 0
      ? analytics.totalUsage / analytics.totalRequests
      : 0;

  return (
    <Grid container spacing={2}>
      {/* Active Tags */}
      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Active Tags"
          value={analytics.activeTags}
          subtitle={`${analytics.usage.length} total tags`}
          icon={<TagIcon />}
          color="primary"
        />
      </Grid>

      {/* Total Tenant Usage */}
      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Total Tenant Usage"
          value={formatCurrency(actualTotalUsage)}
          subtitle={`Tagged: ${formatCurrency(taggedUsage)} | Untagged: ${formatCurrency(untaggedUsage)}`}
          icon={<CostIcon />}
          color="success"
        />
      </Grid>

      {/* Total Requests */}
      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Total Requests"
          value={analytics.totalRequests}
          subtitle={`${analytics.activeTags} active tags`}
          icon={<RequestIcon />}
          color="info"
        />
      </Grid>

      {/* Tagged Usage */}
      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Tagged Usage"
          value={formatCurrency(taggedUsage)}
          subtitle={`${((taggedUsage / actualTotalUsage) * 100).toFixed(1)}% of total`}
          icon={<TagIcon />}
          color="primary"
        />
      </Grid>

      {/* Untagged Usage */}
      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Untagged Usage"
          value={formatCurrency(untaggedUsage)}
          subtitle={`${((untaggedUsage / actualTotalUsage) * 100).toFixed(1)}% of total`}
          icon={<WarningIcon />}
          color={untaggedUsage > 0 ? "warning" : "success"}
        />
      </Grid>

      {/* Average Cost per Request */}
      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Avg Cost per Request"
          value={formatCurrency(avgCostPerRequest)}
          subtitle="Across all tagged requests"
          icon={<TrendingUpIcon />}
          color="info"
        />
      </Grid>

      {/* Critical Budgets (moved to second row) */}
      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Critical Budgets"
          value={analytics.criticalBudgets}
          subtitle={
            analytics.budgetHealth.length > 0
              ? `${((analytics.criticalBudgets / analytics.budgetHealth.length) * 100).toFixed(0)}% of budgets`
              : "No budgets configured"
          }
          icon={<WarningIcon />}
          color={analytics.criticalBudgets > 0 ? "error" : "success"}
        />
      </Grid>
    </Grid>
  );
};

export default TagMetricsCards;
