import React from "react";
import { Grid, Typography, Box } from "@mui/material";
import {
  MonetizationOn as CostIcon,
  Assessment as RequestIcon,
  Memory as ModelIcon,
  TrendingUp as AvgIcon,
  LocalOffer as TagIcon,
  Visibility as CoverageIcon,
} from "@mui/icons-material";
import UsageMetricCard from "./UsageMetricCard";
import SkeletonCard from "../common/SkeletonCard";
import { formatCurrency } from "../../utils/currency";
import type { UsageSummary } from "../../hooks/useUsageInsights";

interface UsageSummaryGridProps {
  summary: UsageSummary;
  isLoading: boolean;
  title?: string;
  timeRangeLabel?: string;
}

const UsageSummaryGrid: React.FC<UsageSummaryGridProps> = ({
  summary,
  isLoading,
  title = "Usage Summary",
  timeRangeLabel,
}) => {
  if (isLoading) {
    return (
      <Box>
        {title && (
          <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
            {title}
            {timeRangeLabel && (
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
                sx={{ ml: 1 }}
              >
                ({timeRangeLabel})
              </Typography>
            )}
          </Typography>
        )}
        <Grid container spacing={2}>
          {Array.from({ length: 6 }, (_, index) => (
            <Grid item xs={12} sm={6} md={4} lg={2} key={index}>
              <SkeletonCard height={120} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  const getCoverageColor = (coverage: number) => {
    if (coverage >= 80) return "success";
    if (coverage >= 50) return "warning";
    return "error";
  };

  return (
    <Box>
      {title && (
        <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
          {title}
          {timeRangeLabel && (
            <Typography
              component="span"
              variant="body2"
              color="text.secondary"
              sx={{ ml: 1 }}
            >
              ({timeRangeLabel})
            </Typography>
          )}
        </Typography>
      )}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <UsageMetricCard
            title="Total Usage"
            value={formatCurrency(summary.totalUsage)}
            icon={<CostIcon />}
            color="primary"
          />
        </Grid>

        <Grid item xs={12} sm={6} md={4} lg={2}>
          <UsageMetricCard
            title="Total Requests"
            value={summary.totalRequests}
            icon={<RequestIcon />}
            color="info"
          />
        </Grid>

        <Grid item xs={12} sm={6} md={4} lg={2}>
          <UsageMetricCard
            title="Models Used"
            value={summary.modelsUsed}
            subtitle={`${summary.modelsUsed === 1 ? "model" : "models"} active`}
            icon={<ModelIcon />}
            color="info"
          />
        </Grid>

        <Grid item xs={12} sm={6} md={4} lg={2}>
          <UsageMetricCard
            title="Avg Cost/Request"
            value={formatCurrency(summary.avgCostPerRequest)}
            icon={<AvgIcon />}
            color="success"
          />
        </Grid>

        <Grid item xs={12} sm={6} md={4} lg={2}>
          <UsageMetricCard
            title="Active Tags"
            value={summary.activeTags}
            subtitle={`${formatCurrency(summary.taggedUsage)} tagged`}
            icon={<TagIcon />}
            color="info"
          />
        </Grid>

        <Grid item xs={12} sm={6} md={4} lg={2}>
          <UsageMetricCard
            title="Tag Coverage"
            value={`${summary.tagCoverage.toFixed(1)}%`}
            subtitle={
              summary.tagCoverage >= 80
                ? "Excellent tracking"
                : summary.tagCoverage >= 50
                  ? "Good coverage"
                  : "Needs improvement"
            }
            icon={<CoverageIcon />}
            color={getCoverageColor(summary.tagCoverage)}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default UsageSummaryGrid;
