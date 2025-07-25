import React from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  LinearProgress,
  Grid,
  Chip,
} from "@mui/material";
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
} from "@mui/icons-material";

interface BudgetHealth {
  period: string;
  budget: number;
  usage: number;
  percentage: number;
  status: "healthy" | "warning" | "critical";
  daysRemaining?: number;
}

interface BudgetHealthIndicatorProps {
  budgets: BudgetHealth[];
  title?: string;
}

const BudgetHealthIndicator: React.FC<BudgetHealthIndicatorProps> = ({
  budgets,
  title = "Budget Health",
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
        return <CheckCircleIcon color="success" />;
      case "warning":
        return <WarningIcon color="warning" />;
      case "critical":
        return <ErrorIcon color="error" />;
      default:
        return null;
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return "error";
    if (percentage >= 75) return "warning";
    return "success";
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Grid container spacing={2}>
          {budgets.map((budget, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <Box
                sx={{
                  p: 2,
                  border: 1,
                  borderColor: `${getStatusColor(budget.status)}.main`,
                  borderRadius: 2,
                  bgcolor: `${getStatusColor(budget.status)}.50`,
                  height: "100%",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mb: 1,
                  }}
                >
                  <Typography variant="subtitle1" fontWeight="medium">
                    {budget.period.charAt(0).toUpperCase() +
                      budget.period.slice(1)}
                  </Typography>
                  {getStatusIcon(budget.status)}
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    ${budget.usage.toFixed(2)} / ${budget.budget.toFixed(2)}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(budget.percentage, 100)}
                    color={getProgressColor(budget.percentage)}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mt: 0.5,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      {budget.percentage.toFixed(1)}% used
                    </Typography>
                    {budget.daysRemaining !== undefined && (
                      <Typography variant="body2" color="text.secondary">
                        {budget.daysRemaining} days left
                      </Typography>
                    )}
                  </Box>
                </Box>

                <Box sx={{ display: "flex", justifyContent: "center" }}>
                  <Chip
                    label={
                      budget.status.charAt(0).toUpperCase() +
                      budget.status.slice(1)
                    }
                    color={
                      getStatusColor(budget.status) as
                        | "success"
                        | "warning"
                        | "error"
                    }
                    size="small"
                    variant="outlined"
                  />
                </Box>
              </Box>
            </Grid>
          ))}
        </Grid>

        {budgets.length === 0 && (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="body1" color="text.secondary">
              No budget data available
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Configure budgets to see health indicators
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default BudgetHealthIndicator;
