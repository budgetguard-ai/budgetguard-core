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
} from "@mui/material";
import { formatCurrency } from "../../utils/currency";
import {
  useSessionBudget,
  useSetSessionBudget,
  useRemoveSessionBudget,
} from "../../hooks/useApi";

interface ManageSessionBudgetDialogProps {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  sessionId: string;
  sessionName?: string;
}

export const ManageSessionBudgetDialog: React.FC<
  ManageSessionBudgetDialogProps
> = ({ open, onClose, tenantId, sessionId, sessionName }) => {
  const [budgetInput, setBudgetInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Queries and mutations
  const {
    data: sessionBudget,
    isLoading,
    error: fetchError,
  } = useSessionBudget(tenantId, sessionId, open);

  const setSessionBudgetMutation = useSetSessionBudget();
  const removeSessionBudgetMutation = useRemoveSessionBudget();

  // Initialize budget input when dialog opens
  useEffect(() => {
    if (open && sessionBudget) {
      setBudgetInput(sessionBudget.effectiveBudgetUsd?.toString() || "");
      setError(null);
    }
  }, [open, sessionBudget]);

  const handleSubmit = async () => {
    const budget = parseFloat(budgetInput);

    if (isNaN(budget) || budget < 0) {
      setError("Please enter a valid budget amount (must be non-negative)");
      return;
    }

    try {
      await setSessionBudgetMutation.mutateAsync({
        tenantId,
        sessionId,
        budgetUsd: budget,
      });
      onClose();
    } catch {
      setError("Failed to update session budget. Please try again.");
    }
  };

  const handleRemoveBudget = async () => {
    try {
      await removeSessionBudgetMutation.mutateAsync({
        tenantId,
        sessionId,
      });
      onClose();
    } catch {
      setError("Failed to remove session budget. Please try again.");
    }
  };

  const isSubmitting =
    setSessionBudgetMutation.isPending || removeSessionBudgetMutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Manage Session Budget
        {sessionName && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Session: {sessionName}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent>
        {isLoading ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress />
          </Box>
        ) : fetchError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load session budget information
          </Alert>
        ) : sessionBudget ? (
          <Box>
            {/* Current Budget Info */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Current Budget Information
              </Typography>

              <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Current Budget
                  </Typography>
                  <Typography variant="h6">
                    {sessionBudget.effectiveBudgetUsd
                      ? formatCurrency(sessionBudget.effectiveBudgetUsd)
                      : "No budget set"}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Current Usage
                  </Typography>
                  <Typography variant="h6">
                    {formatCurrency(sessionBudget.currentCostUsd)}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Budget Source
                </Typography>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <Chip
                    label={
                      sessionBudget.budgetSource.hasCustomBudget
                        ? "Custom Budget"
                        : "Tenant Default"
                    }
                    size="small"
                    color={
                      sessionBudget.budgetSource.hasCustomBudget
                        ? "primary"
                        : "default"
                    }
                  />
                  <Typography variant="body2" color="text.secondary">
                    Tenant: {sessionBudget.budgetSource.tenantName}
                    {sessionBudget.budgetSource.tenantDefaultBudget && (
                      <>
                        {" "}
                        (Default:{" "}
                        {formatCurrency(
                          sessionBudget.budgetSource.tenantDefaultBudget,
                        )}
                        )
                      </>
                    )}
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Budget Input */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Set Custom Budget
              </Typography>
              <TextField
                fullWidth
                label="Budget Amount"
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
                helperText={error || "Enter 0 or more to set a custom budget"}
                disabled={isSubmitting}
              />
            </Box>

            {/* Remove Budget Option */}
            {sessionBudget.budgetSource.hasCustomBudget && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Or remove the custom budget to revert to tenant default
                </Typography>
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={handleRemoveBudget}
                  disabled={isSubmitting}
                >
                  {removeSessionBudgetMutation.isPending ? (
                    <>
                      <CircularProgress size={20} sx={{ mr: 1 }} />
                      Removing...
                    </>
                  ) : (
                    "Remove Custom Budget"
                  )}
                </Button>
              </Box>
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
          {setSessionBudgetMutation.isPending ? (
            <>
              <CircularProgress size={20} sx={{ mr: 1 }} />
              Saving...
            </>
          ) : (
            "Set Budget"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
