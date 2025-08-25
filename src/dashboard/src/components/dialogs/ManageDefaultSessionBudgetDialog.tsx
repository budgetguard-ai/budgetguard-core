import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Chip,
  InputAdornment,
  Divider,
} from "@mui/material";
import { formatCurrency } from "../../utils/currency";
import {
  useTenantDefaultSessionBudget,
  useSetTenantDefaultSessionBudget,
  useRemoveTenantDefaultSessionBudget,
} from "../../hooks/useApi";
import type { Tenant } from "../../types";

interface ManageDefaultSessionBudgetDialogProps {
  open: boolean;
  onClose: () => void;
  tenant: Tenant | null;
}

export const ManageDefaultSessionBudgetDialog: React.FC<
  ManageDefaultSessionBudgetDialogProps
> = ({ open, onClose, tenant }) => {
  const [budgetInput, setBudgetInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Queries and mutations
  const {
    data: tenantBudget,
    isLoading,
    error: fetchError,
  } = useTenantDefaultSessionBudget(tenant?.id || 0, open && !!tenant);

  const setBudgetMutation = useSetTenantDefaultSessionBudget();
  const removeBudgetMutation = useRemoveTenantDefaultSessionBudget();

  // Initialize budget input when dialog opens
  useEffect(() => {
    if (open && tenantBudget) {
      setBudgetInput(tenantBudget.defaultSessionBudgetUsd?.toString() || "");
      setError(null);
    }
  }, [open, tenantBudget]);

  if (!tenant) return null;

  const handleSubmit = async () => {
    const budget = parseFloat(budgetInput);

    if (isNaN(budget) || budget < 0) {
      setError("Please enter a valid budget amount (must be non-negative)");
      return;
    }

    try {
      await setBudgetMutation.mutateAsync({
        tenantId: tenant.id,
        budgetUsd: budget,
      });
      onClose();
    } catch {
      setError(
        "Failed to update tenant default session budget. Please try again.",
      );
    }
  };

  const handleRemoveBudget = async () => {
    try {
      await removeBudgetMutation.mutateAsync({
        tenantId: tenant.id,
      });
      onClose();
    } catch {
      setError(
        "Failed to remove tenant default session budget. Please try again.",
      );
    }
  };

  const isSubmitting =
    setBudgetMutation.isPending || removeBudgetMutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Manage Default Session Budget
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Tenant: {tenant.name}
        </Typography>
      </DialogTitle>

      <DialogContent>
        {isLoading ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress />
          </Box>
        ) : fetchError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load tenant budget information
          </Alert>
        ) : tenantBudget ? (
          <Box>
            {/* Current Budget Info */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Current Default Budget
              </Typography>

              <Box sx={{ display: "flex", gap: 3, mb: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Default Session Budget
                  </Typography>
                  <Typography variant="h6">
                    {tenantBudget.defaultSessionBudgetUsd
                      ? formatCurrency(tenantBudget.defaultSessionBudgetUsd)
                      : "No default budget set"}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Active Sessions
                  </Typography>
                  <Typography variant="h6">
                    {tenantBudget.sessionCount}
                  </Typography>
                </Box>
              </Box>

              {tenantBudget.defaultSessionBudgetUsd && (
                <Box sx={{ mb: 2 }}>
                  <Chip
                    label="Default Budget Active"
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </Box>
              )}
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Budget Input */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Set New Default Budget
              </Typography>
              <TextField
                fullWidth
                label="Default Budget Amount"
                type="number"
                value={budgetInput}
                onChange={(e) => {
                  setBudgetInput(e.target.value);
                  setError(null);
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                }}
                error={!!error}
                helperText={
                  error ||
                  "This budget will be applied to new sessions that don't have custom budgets"
                }
                disabled={isSubmitting}
              />
            </Box>

            {/* Remove Budget Option */}
            {tenantBudget.defaultSessionBudgetUsd && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Or remove the default budget so new sessions have no budget
                  limit
                </Typography>
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={handleRemoveBudget}
                  disabled={isSubmitting}
                  size="small"
                >
                  {removeBudgetMutation.isPending ? (
                    <>
                      <CircularProgress size={16} sx={{ mr: 1 }} />
                      Removing...
                    </>
                  ) : (
                    "Remove Default Budget"
                  )}
                </Button>
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </Box>
        ) : null}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting || !budgetInput.trim()}
        >
          {setBudgetMutation.isPending ? (
            <>
              <CircularProgress size={20} sx={{ mr: 1 }} />
              Saving...
            </>
          ) : (
            "Set Default Budget"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
