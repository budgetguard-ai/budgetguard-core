import React from "react";
import { Grid, Typography, Box } from "@mui/material";
import BudgetStatusCard from "./BudgetStatusCard";
import SkeletonCard from "../common/SkeletonCard";
import EmptyState from "../common/EmptyState";
import type { BudgetHealthStatus } from "../../hooks/useBudgetHealth";

interface BudgetStatusGridProps {
  budgetStatus: BudgetHealthStatus[];
  isLoading: boolean;
  title?: string;
}

const BudgetStatusGrid: React.FC<BudgetStatusGridProps> = ({
  budgetStatus,
  isLoading,
  title = "Budget Status",
}) => {
  if (isLoading) {
    return (
      <Box>
        {title && (
          <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
            {title}
          </Typography>
        )}
        <Grid container spacing={2}>
          {Array.from({ length: 3 }, (_, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <SkeletonCard height={200} showTitle showSubtitle lines={3} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  if (budgetStatus.length === 0) {
    return (
      <Box>
        {title && (
          <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
            {title}
          </Typography>
        )}
        <EmptyState
          title="No Budgets Configured"
          message="Configure daily or monthly budgets to monitor spending and get alerts when limits are approached."
        />
      </Box>
    );
  }

  return (
    <Box>
      {title && (
        <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
          {title}
        </Typography>
      )}
      <Grid container spacing={2}>
        {budgetStatus.map((budget, index) => (
          <Grid item xs={12} sm={6} md={4} key={`${budget.period}-${index}`}>
            <BudgetStatusCard budgetStatus={budget} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default BudgetStatusGrid;
