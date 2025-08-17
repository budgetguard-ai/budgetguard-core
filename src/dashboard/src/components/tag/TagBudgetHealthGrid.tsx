import React from "react";
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Chip,
} from "@mui/material";
import {
  CheckCircle as HealthyIcon,
  Warning as WarningIcon,
  Error as CriticalIcon,
  LocalOffer as TagIcon,
} from "@mui/icons-material";
import { formatCurrency } from "../../utils/currency";
import EmptyState from "../common/EmptyState";
import type { TagBudgetHealth } from "../../types";

interface TagBudgetHealthGridProps {
  tagBudgets: TagBudgetHealth[];
  title?: string;
}

const TagBudgetHealthCard: React.FC<{ tagBudget: TagBudgetHealth }> = ({
  tagBudget,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "success";
      case "warning":
        return "warning";
      case "critical":
        return "error";
      default:
        return "primary";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <HealthyIcon color="success" />;
      case "warning":
        return <WarningIcon color="warning" />;
      case "critical":
        return <CriticalIcon color="error" />;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardContent sx={{ p: 2.5 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <TagIcon sx={{ fontSize: 18, color: "text.secondary" }} />
            <Typography variant="subtitle1" fontWeight="medium" noWrap>
              {tagBudget.tagName}
            </Typography>
          </Box>
          {getStatusIcon(tagBudget.status)}
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              mb: 1,
            }}
          >
            <Typography variant="body2">
              {formatCurrency(tagBudget.usage)} /{" "}
              {formatCurrency(tagBudget.budget)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tagBudget.percentage.toFixed(1)}%
            </Typography>
          </Box>

          <LinearProgress
            variant="determinate"
            value={Math.min(tagBudget.percentage, 100)}
            color={
              tagBudget.percentage >= 90
                ? "error"
                : tagBudget.percentage >= 75
                  ? "warning"
                  : "success"
            }
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Chip
            label={`${tagBudget.period} budget`}
            size="small"
            variant="outlined"
            sx={{ fontSize: "0.7rem" }}
          />
          <Chip
            label={tagBudget.status}
            color={
              getStatusColor(tagBudget.status) as
                | "success"
                | "warning"
                | "error"
                | "primary"
            }
            size="small"
            variant="filled"
            sx={{ fontSize: "0.7rem" }}
          />
        </Box>
      </CardContent>
    </Card>
  );
};

const TagBudgetHealthGrid: React.FC<TagBudgetHealthGridProps> = ({
  tagBudgets,
  title = "Tag Budget Health",
}) => {
  if (tagBudgets.length === 0) {
    return (
      <Box>
        {title && (
          <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
            {title}
          </Typography>
        )}
        <EmptyState
          title="No Tag Budgets"
          message="No tag-specific budgets are configured. Set up tag budgets to monitor spending by team, project, or feature."
        />
      </Box>
    );
  }

  // Sort by status priority (critical first) then by usage percentage
  const sortedTagBudgets = [...tagBudgets].sort((a, b) => {
    const statusOrder = { critical: 0, warning: 1, healthy: 2 };
    const statusDiff =
      (statusOrder[a.status as keyof typeof statusOrder] || 3) -
      (statusOrder[b.status as keyof typeof statusOrder] || 3);
    if (statusDiff !== 0) return statusDiff;
    return b.percentage - a.percentage;
  });

  return (
    <Box>
      {title && (
        <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
          {title}
        </Typography>
      )}
      <Grid container spacing={2}>
        {sortedTagBudgets.map((tagBudget) => (
          <Grid item xs={12} sm={6} md={4} key={tagBudget.budgetId}>
            <TagBudgetHealthCard tagBudget={tagBudget} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default TagBudgetHealthGrid;
