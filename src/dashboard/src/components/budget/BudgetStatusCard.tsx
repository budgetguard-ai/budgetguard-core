import React from "react";
import {
  Card,
  CardContent,
  Box,
  Typography,
  LinearProgress,
  Chip,
} from "@mui/material";
import {
  CheckCircle as HealthyIcon,
  Warning as WarningIcon,
  Error as CriticalIcon,
  AccessTime as TimeIcon,
} from "@mui/icons-material";
import { formatCurrency } from "../../utils/currency";
import type { BudgetHealthStatus } from "../../hooks/useBudgetHealth";

interface BudgetStatusCardProps {
  budgetStatus: BudgetHealthStatus;
  showTimeRemaining?: boolean;
}

const BudgetStatusCard: React.FC<BudgetStatusCardProps> = ({
  budgetStatus,
  showTimeRemaining = true,
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

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return "error";
    if (percentage >= 75) return "warning";
    return "success";
  };

  const formatTimeRemaining = (days?: number) => {
    if (days === undefined) return null;
    if (days <= 0) return "Period ended";
    if (days === 1) return "1 day left";
    if (days < 7) return `${days} days left`;
    if (days < 30) {
      const weeks = Math.round(days / 7);
      return `${weeks} week${weeks === 1 ? "" : "s"} left`;
    }
    const months = Math.round(days / 30);
    return `${months} month${months === 1 ? "" : "s"} left`;
  };

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Typography variant="h6" fontWeight="medium">
            {budgetStatus.period.charAt(0).toUpperCase() +
              budgetStatus.period.slice(1)}{" "}
            Budget
          </Typography>
          {getStatusIcon(budgetStatus.status)}
        </Box>

        {/* Budget Progress */}
        <Box sx={{ mb: 2 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              mb: 1,
            }}
          >
            <Typography variant="body1" fontWeight="medium">
              {formatCurrency(budgetStatus.usage)} /{" "}
              {formatCurrency(budgetStatus.budget)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {budgetStatus.percentage.toFixed(1)}% used
            </Typography>
          </Box>

          <LinearProgress
            variant="determinate"
            value={Math.min(budgetStatus.percentage, 100)}
            color={getProgressColor(budgetStatus.percentage)}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: "rgba(0, 0, 0, 0.1)",
            }}
          />
        </Box>

        {/* Status and Time Info */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Chip
            label={
              budgetStatus.status.charAt(0).toUpperCase() +
              budgetStatus.status.slice(1)
            }
            color={
              getStatusColor(budgetStatus.status) as
                | "success"
                | "warning"
                | "error"
                | "primary"
            }
            size="small"
            variant="outlined"
          />

          {showTimeRemaining && budgetStatus.daysRemaining !== undefined && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <TimeIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography variant="body2" color="text.secondary">
                {formatTimeRemaining(budgetStatus.daysRemaining)}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Budget Period Info */}
        {budgetStatus.startDate && budgetStatus.endDate && (
          <Box
            sx={{
              mt: 2,
              pt: 2,
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Period: {new Date(budgetStatus.startDate).toLocaleDateString()} -{" "}
              {new Date(budgetStatus.endDate).toLocaleDateString()}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default BudgetStatusCard;
