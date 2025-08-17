import React from "react";
import { Grid, Card, CardContent, Box, Typography } from "@mui/material";
import {
  AccountBalanceWallet as BudgetIcon,
  TrendingUp as UsageIcon,
  Assessment as UtilizationIcon,
  Warning as CriticalIcon,
} from "@mui/icons-material";
import { formatCurrency } from "../../utils/currency";
import type { FinancialSummary } from "../../hooks/useBudgetHealth";

interface FinancialSummaryProps {
  summary: FinancialSummary;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactElement;
  color?: "primary" | "success" | "warning" | "error" | "info";
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color = "primary",
}) => {
  return (
    <Card>
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ color: `${color}.main` }}>
            {React.cloneElement(icon, { sx: { fontSize: 32 } })}
          </Box>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h5" color={`${color}.main`} noWrap>
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
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

const FinancialSummary: React.FC<FinancialSummaryProps> = ({ summary }) => {
  const utilizationColor =
    summary.budgetUtilization >= 90
      ? "error"
      : summary.budgetUtilization >= 75
        ? "warning"
        : "success";

  const criticalColor = summary.criticalBudgets > 0 ? "error" : "success";

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Total Budget"
          value={formatCurrency(summary.totalBudget)}
          subtitle={`${summary.activeBudgets} active budget${summary.activeBudgets === 1 ? "" : "s"}`}
          icon={<BudgetIcon />}
          color="primary"
        />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Total Usage"
          value={formatCurrency(summary.totalUsage)}
          subtitle={`${formatCurrency(summary.remainingBudget)} remaining`}
          icon={<UsageIcon />}
          color="info"
        />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Budget Utilization"
          value={`${summary.budgetUtilization.toFixed(1)}%`}
          subtitle={
            summary.budgetUtilization >= 90
              ? "Critical level"
              : summary.budgetUtilization >= 75
                ? "High usage"
                : "Within limits"
          }
          icon={<UtilizationIcon />}
          color={utilizationColor}
        />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <MetricCard
          title="Critical Budgets"
          value={summary.criticalBudgets}
          subtitle={
            summary.criticalBudgets > 0
              ? `Need immediate attention`
              : "All budgets healthy"
          }
          icon={<CriticalIcon />}
          color={criticalColor}
        />
      </Grid>
    </Grid>
  );
};

export default FinancialSummary;
