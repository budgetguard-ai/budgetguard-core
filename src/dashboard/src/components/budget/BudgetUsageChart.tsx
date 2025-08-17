import React from "react";
import { Card, CardContent, Typography, Box } from "@mui/material";
import BudgetVsUsageChart from "../charts/BudgetVsUsageChart";
import type { BudgetHealthStatus } from "../../hooks/useBudgetHealth";

interface BudgetUsageChartProps {
  budgetStatus: BudgetHealthStatus[];
  title?: string;
  height?: number;
}

const BudgetUsageChart: React.FC<BudgetUsageChartProps> = ({
  budgetStatus,
  title = "Budget vs Usage Overview",
  height = 300,
}) => {
  // Transform budget status data into expected format
  const chartData = {
    labels: budgetStatus.map(
      (budget) =>
        budget.period.charAt(0).toUpperCase() + budget.period.slice(1),
    ),
    usage: budgetStatus.map((budget) => budget.usage),
    budgets: budgetStatus.map((budget) => budget.budget),
  };

  if (budgetStatus.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {title}
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height,
              color: "text.secondary",
            }}
          >
            <Typography>No budget data available</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <BudgetVsUsageChart data={chartData} title="" height={height} />
      </CardContent>
    </Card>
  );
};

export default BudgetUsageChart;
