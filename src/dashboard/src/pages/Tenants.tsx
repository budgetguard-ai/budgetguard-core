import React, { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Alert,
  Grid,
  Chip,
  Skeleton,
  Button,
  CardActions,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  AccountBalance as BudgetIcon,
  Key as KeyIcon,
} from "@mui/icons-material";
import { useTenants, useTenantBudgets, useTenantUsage } from "../hooks/useApi";
import { formatCurrency } from "../utils/currency";
import {
  CreateTenantDialog,
  EditTenantDialog,
  DeleteConfirmationDialog,
  ManageBudgetsDialog,
  ManageApiKeysDialog,
} from "../components/dialogs";
import type { Tenant, Budget, BudgetUsage } from "../types";

const Tenants: React.FC = () => {
  const { data: tenants, isLoading, error } = useTenants();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [apiKeysDialogOpen, setApiKeysDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  const handleEditTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setEditDialogOpen(true);
  };

  const handleDeleteTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setDeleteDialogOpen(true);
  };

  const handleManageBudgets = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setBudgetDialogOpen(true);
  };

  const handleManageApiKeys = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setApiKeysDialogOpen(true);
  };

  const handleCloseDialogs = () => {
    setCreateDialogOpen(false);
    setEditDialogOpen(false);
    setDeleteDialogOpen(false);
    setBudgetDialogOpen(false);
    setApiKeysDialogOpen(false);
    setSelectedTenant(null);
  };

  // Skeleton loading component
  const TenantCardSkeleton = () => (
    <Card sx={{ width: "100%", boxSizing: "border-box" }}>
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Skeleton variant="text" width="60%" height={32} sx={{ mb: 2 }} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
          >
            <Skeleton variant="text" width={30} height={20} />
            <Skeleton
              variant="rectangular"
              width={40}
              height={24}
              sx={{ borderRadius: 12 }}
            />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  // Budget info component for each tenant
  const TenantBudgetInfo: React.FC<{ tenant: Tenant }> = ({ tenant }) => {
    const { data: budgets = [] } = useTenantBudgets(tenant.id);
    const { data: usage } = useTenantUsage(tenant.id);

    const isExpired = (budget: Budget) => {
      // Recurring budgets (daily/monthly) never expire
      if (
        budget.isRecurring ||
        budget.period === "daily" ||
        budget.period === "monthly"
      ) {
        return false;
      }

      // Only custom budgets can expire
      if (budget.period === "custom" && budget.endDate) {
        const endDate = new Date(budget.endDate);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        return endDate < today;
      }
      return false;
    };

    const getBudgetStatus = (budget: Budget) => {
      if (isExpired(budget)) return "default";

      // Use currentUsage from the enhanced API response if available
      if (budget.currentUsage !== undefined) {
        const budgetAmount = parseFloat(budget.amountUsd);
        const usagePercent = (budget.currentUsage / budgetAmount) * 100;

        if (usagePercent >= 90) return "error";
        if (usagePercent >= 75) return "warning";
        return "success";
      }

      // Fallback to usage API data
      if (!usage || !Array.isArray(usage) || usage.length === 0)
        return "success";

      const currentUsage = usage.find(
        (u: BudgetUsage) => u.period === budget.period,
      );
      if (!currentUsage) return "success";

      const usagePercent = (currentUsage.usage / currentUsage.budget) * 100;

      if (usagePercent >= 90) return "error";
      if (usagePercent >= 75) return "warning";
      return "success";
    };

    const getCurrentUsage = (budget: Budget) => {
      // Use currentUsage from the enhanced API response if available
      if (budget.currentUsage !== undefined) {
        return budget.currentUsage;
      }

      // Fallback to usage API data
      if (!usage || !Array.isArray(usage) || usage.length === 0) return 0;
      const currentUsage = usage.find(
        (u: BudgetUsage) => u.period === budget.period,
      );
      return currentUsage?.usage || 0;
    };

    const getBudgetLabel = (budget: Budget) => {
      if (isExpired(budget)) {
        return `${formatCurrency(budget.amountUsd)} (${budget.period} - EXPIRED)`;
      }

      const usage = getCurrentUsage(budget);
      const periodLabel = budget.period;

      return `${formatCurrency(usage)} / ${formatCurrency(budget.amountUsd)} (${periodLabel})`;
    };

    // Filter active budgets (non-expired)
    const activeBudgets = budgets.filter((budget) => !isExpired(budget));
    const expiredBudgets = budgets.filter((budget) => isExpired(budget));

    if (budgets.length === 0) {
      return (
        <Box display="flex" alignItems="center" mb={1}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
            Budgets:
          </Typography>
          <Chip
            label="Not configured"
            size="small"
            color="default"
            variant="outlined"
          />
        </Box>
      );
    }

    return (
      <Box mb={1}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Budgets:
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {activeBudgets.map((budget) => (
            <Chip
              key={budget.id}
              label={getBudgetLabel(budget)}
              size="small"
              color={getBudgetStatus(budget) as "success" | "warning" | "error"}
              variant="outlined"
            />
          ))}
          {expiredBudgets.map((budget) => (
            <Chip
              key={budget.id}
              label={getBudgetLabel(budget)}
              size="small"
              color="default"
              variant="outlined"
              sx={{ opacity: 0.7 }}
            />
          ))}
          {activeBudgets.length === 0 && expiredBudgets.length > 0 && (
            <Chip
              label="All budgets expired"
              size="small"
              color="default"
              variant="outlined"
            />
          )}
        </Box>
      </Box>
    );
  };

  if (isLoading) {
    return (
      <Box sx={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
        <Typography
          variant="h4"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, mb: 4 }}
        >
          Tenant Management
        </Typography>
        <Grid container spacing={3} sx={{ width: "100%", margin: 0 }}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Grid item xs={12} sm={6} md={4} xl={3} key={index}>
              <TenantCardSkeleton />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">Failed to load tenants: {error.message}</Alert>
    );
  }

  return (
    <Box sx={{ width: "100%", maxWidth: "100%", position: "relative" }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 600, mb: 3 }}>
        Tenant Management
      </Typography>

      <Box sx={{ mb: 4 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
          sx={{ minWidth: 140 }}
        >
          Create Tenant
        </Button>
      </Box>

      <Grid container spacing={3}>
        {tenants?.map((tenant) => (
          <Grid
            item
            xs={12}
            sm={6}
            md={4}
            lg={4}
            key={tenant.id}
            sx={{ minWidth: 320 }} // Add this line
          >
            <Card
              sx={{
                display: "flex",
                flexDirection: "column",
                width: "100%", // Let the grid control the width
                minWidth: 0, // Prevent overflow and overlap
                boxSizing: "border-box",
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                  {tenant.name}
                </Typography>
                <Box display="flex" alignItems="center" mb={1}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mr: 1 }}
                  >
                    ID:
                  </Typography>
                  <Chip
                    label={tenant.id}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </Box>
                {tenant.createdAt && (
                  <Box display="flex" alignItems="center" mb={1}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mr: 1 }}
                    >
                      Created:
                    </Typography>
                    <Typography variant="body2" color="text.primary">
                      {(() => {
                        try {
                          const date = new Date(tenant.createdAt);
                          if (isNaN(date.getTime())) return "Unknown";
                          return date.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          });
                        } catch {
                          return "Unknown";
                        }
                      })()}
                    </Typography>
                  </Box>
                )}
                {tenant.updatedAt && (
                  <Box display="flex" alignItems="center" mb={1}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mr: 1 }}
                    >
                      Updated:
                    </Typography>
                    <Typography variant="body2" color="text.primary">
                      {(() => {
                        try {
                          const date = new Date(tenant.updatedAt);
                          if (isNaN(date.getTime())) return "Unknown";
                          return date.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          });
                        } catch {
                          return "Unknown";
                        }
                      })()}
                    </Typography>
                  </Box>
                )}
                {tenant.rateLimitPerMin !== null &&
                  tenant.rateLimitPerMin !== undefined && (
                    <Box display="flex" alignItems="center" mb={1}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mr: 1 }}
                      >
                        Rate Limit:
                      </Typography>
                      <Chip
                        label={`${tenant.rateLimitPerMin}/min`}
                        size="small"
                        color="secondary"
                        variant="outlined"
                      />
                    </Box>
                  )}
                <TenantBudgetInfo tenant={tenant} />
              </CardContent>
              <CardActions
                sx={{ justifyContent: "space-between", p: 2, pt: 0 }}
              >
                <Box>
                  <Tooltip title="View Details">
                    <IconButton size="small" color="primary">
                      <InfoIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Manage Budgets">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => handleManageBudgets(tenant)}
                    >
                      <BudgetIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Manage API Keys">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => handleManageApiKeys(tenant)}
                    >
                      <KeyIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box>
                  <Tooltip title="Edit Tenant">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => handleEditTenant(tenant)}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete Tenant">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteTenant(tenant)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {tenants?.length === 0 && (
        <Box textAlign="center" py={8}>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
            No tenants found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create your first tenant to get started
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Tenant
          </Button>
        </Box>
      )}

      {/* Dialogs */}
      <CreateTenantDialog
        open={createDialogOpen}
        onClose={handleCloseDialogs}
      />

      <EditTenantDialog
        open={editDialogOpen}
        tenant={selectedTenant}
        onClose={handleCloseDialogs}
      />

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        tenant={selectedTenant}
        onClose={handleCloseDialogs}
      />

      <ManageBudgetsDialog
        open={budgetDialogOpen}
        tenant={selectedTenant}
        onClose={handleCloseDialogs}
      />

      <ManageApiKeysDialog
        open={apiKeysDialogOpen}
        tenant={selectedTenant}
        onClose={handleCloseDialogs}
      />
    </Box>
  );
};

export default Tenants;
