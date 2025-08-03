import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  Box,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import {
  useTenantBudgets,
  useCreateTenantBudgets,
  useUpdateBudget,
  useDeleteBudget,
} from "../../hooks/useApi";
import type { Tenant, Budget, CreateBudgetRequest } from "../../types";
import { formatCurrency } from "../../utils/currency";

interface ManageBudgetsDialogProps {
  open: boolean;
  tenant: Tenant | null;
  onClose: () => void;
}

interface BudgetFormData {
  period: "daily" | "monthly" | "custom";
  amountUsd: string;
  startDate: string;
  endDate: string;
}

const ManageBudgetsDialog: React.FC<ManageBudgetsDialogProps> = ({
  open,
  tenant,
  onClose,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [formData, setFormData] = useState<BudgetFormData>({
    period: "monthly",
    amountUsd: "",
    startDate: "",
    endDate: "",
  });
  const [localError, setLocalError] = useState<string | null>(null);

  // Hooks
  const { data: budgets = [], isLoading } = useTenantBudgets(tenant?.id || 0);
  const createBudgetMutation = useCreateTenantBudgets();
  const updateBudgetMutation = useUpdateBudget();
  const deleteBudgetMutation = useDeleteBudget();

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setIsCreating(false);
      setEditingBudget(null);
      resetForm();
    }
  }, [open]);

  // Initialize form when editing a budget
  useEffect(() => {
    if (editingBudget) {
      setFormData({
        period: editingBudget.period,
        amountUsd: editingBudget.amountUsd,
        startDate: editingBudget.startDate || "",
        endDate: editingBudget.endDate || "",
      });
      setIsCreating(true);
    }
  }, [editingBudget]);

  const resetForm = () => {
    const today = new Date().toISOString().split("T")[0];
    setFormData({
      period: "monthly",
      amountUsd: "",
      startDate: today,
      endDate: today,
    });
    setLocalError(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setEditingBudget(null);
    setIsCreating(true);
  };

  const handleStartEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setIsCreating(true);
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setEditingBudget(null);
    resetForm();
  };

  const validateForm = (): boolean => {
    if (!formData.amountUsd || parseFloat(formData.amountUsd) <= 0) {
      setLocalError("Amount must be greater than 0");
      return false;
    }

    // Only validate dates for custom periods (daily/monthly are recurring)
    if (formData.period === "custom") {
      if (!formData.startDate || !formData.endDate) {
        setLocalError("Start and end dates are required for custom periods");
        return false;
      }
      if (new Date(formData.startDate) >= new Date(formData.endDate)) {
        setLocalError("Start date must be before end date");
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;

    setLocalError(null);

    if (!validateForm()) return;

    try {
      if (editingBudget) {
        // Update existing budget - only send dates for custom periods
        const updateData: Partial<Budget> = {
          period: formData.period,
          amountUsd: formData.amountUsd,
        };

        // Only include dates for custom periods (daily/monthly are recurring)
        if (formData.period === "custom") {
          updateData.startDate = formData.startDate;
          updateData.endDate = formData.endDate;
        }

        await updateBudgetMutation.mutateAsync({
          budgetId: editingBudget.id,
          data: updateData,
        });
      } else {
        // Create new budget - only send dates for custom periods
        const budgetData: CreateBudgetRequest = {
          budgets: [
            {
              period: formData.period,
              amountUsd: parseFloat(formData.amountUsd),
              // Only include dates for custom periods (daily/monthly are recurring)
              ...(formData.period === "custom" && {
                startDate: formData.startDate,
                endDate: formData.endDate,
              }),
            },
          ],
        };

        await createBudgetMutation.mutateAsync({
          tenantId: tenant.id,
          data: budgetData,
        });
      }

      handleCancelCreate();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unknown error");
    }
  };

  const handleDelete = async (budgetId: number) => {
    try {
      await deleteBudgetMutation.mutateAsync(budgetId);
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Failed to delete budget",
      );
    }
  };

  const handleClose = () => {
    setIsCreating(false);
    setEditingBudget(null);
    resetForm();
    onClose();
  };

  const formatPeriod = (period: string) => {
    return period.charAt(0).toUpperCase() + period.slice(1);
  };

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

  const formatDateRange = (budget: Budget) => {
    const expired = isExpired(budget);
    let dateInfo = "";

    if (budget.period === "custom" && budget.startDate && budget.endDate) {
      dateInfo = ` (${new Date(budget.startDate).toLocaleDateString()} - ${new Date(budget.endDate).toLocaleDateString()})`;
    } else if (
      budget.isRecurring ||
      budget.period === "daily" ||
      budget.period === "monthly"
    ) {
      // Show current period for recurring budgets
      if (budget.currentPeriodStartDate && budget.currentPeriodEndDate) {
        const start = new Date(
          budget.currentPeriodStartDate,
        ).toLocaleDateString();
        const end = new Date(budget.currentPeriodEndDate).toLocaleDateString();
        dateInfo = ` (Current: ${start}${start !== end ? ` - ${end}` : ""})`;
      } else {
        dateInfo = " (Recurring)";
      }
    }

    return expired ? `${dateInfo} - EXPIRED` : dateInfo;
  };

  const isPending =
    createBudgetMutation.isPending ||
    updateBudgetMutation.isPending ||
    deleteBudgetMutation.isPending;
  const error =
    localError ||
    createBudgetMutation.error?.message ||
    updateBudgetMutation.error?.message ||
    deleteBudgetMutation.error?.message;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Manage Budgets - {tenant?.name}
        {!isCreating && (
          <Button
            startIcon={<AddIcon />}
            onClick={handleStartCreate}
            sx={{ float: "right" }}
            disabled={isPending}
          >
            Add Budget
          </Button>
        )}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {isCreating ? (
            <Box
              component="form"
              onSubmit={handleSubmit}
              sx={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              <Typography variant="h6">
                {editingBudget ? "Edit Budget" : "Create New Budget"}
              </Typography>

              <FormControl fullWidth>
                <InputLabel>Period</InputLabel>
                <Select
                  value={formData.period}
                  label="Period"
                  onChange={(e) => {
                    const newPeriod = e.target.value as
                      | "daily"
                      | "monthly"
                      | "custom";
                    const today = new Date().toISOString().split("T")[0];

                    setFormData({
                      ...formData,
                      period: newPeriod,
                      // Only set dates for custom periods (daily/monthly are recurring)
                      startDate:
                        newPeriod === "custom"
                          ? formData.startDate || today
                          : "",
                      endDate:
                        newPeriod === "custom" ? formData.endDate || today : "",
                    });
                  }}
                  disabled={isPending}
                >
                  <MenuItem value="daily">Daily</MenuItem>
                  <MenuItem value="monthly">Monthly</MenuItem>
                  <MenuItem value="custom">Custom</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Budget Amount"
                type="number"
                fullWidth
                variant="outlined"
                value={formData.amountUsd}
                onChange={(e) =>
                  setFormData({ ...formData, amountUsd: e.target.value })
                }
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                }}
                helperText="Budget amount in USD"
                disabled={isPending}
                inputProps={{ min: 0, step: 0.01 }}
                required
              />

              {formData.period === "custom" && (
                <Box sx={{ display: "flex", gap: 2 }}>
                  <TextField
                    label="Start Date"
                    type="date"
                    fullWidth
                    variant="outlined"
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, startDate: e.target.value })
                    }
                    InputLabelProps={{ shrink: true }}
                    disabled={isPending}
                    required
                  />
                  <TextField
                    label="End Date"
                    type="date"
                    fullWidth
                    variant="outlined"
                    value={formData.endDate}
                    onChange={(e) =>
                      setFormData({ ...formData, endDate: e.target.value })
                    }
                    InputLabelProps={{ shrink: true }}
                    disabled={isPending}
                    required
                  />
                </Box>
              )}

              <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                <Button onClick={handleCancelCreate} disabled={isPending}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isPending || !formData.amountUsd}
                >
                  {isPending
                    ? "Saving..."
                    : editingBudget
                      ? "Update"
                      : "Create"}
                </Button>
              </Box>
            </Box>
          ) : (
            <Box>
              {isLoading ? (
                <Typography>Loading budgets...</Typography>
              ) : budgets.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 4 }}>
                  <Typography variant="body1" color="text.secondary">
                    No budgets configured for this tenant.
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    Click "Add Budget" to create the first budget.
                  </Typography>
                </Box>
              ) : (
                <List>
                  {budgets.map((budget, index) => (
                    <React.Fragment key={budget.id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 0.5,
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                <Typography variant="body1">
                                  {formatCurrency(budget.amountUsd)}
                                </Typography>
                                <Chip
                                  label={formatPeriod(budget.period)}
                                  size="small"
                                  color={
                                    isExpired(budget) ? "default" : "primary"
                                  }
                                  variant="outlined"
                                  sx={isExpired(budget) ? { opacity: 0.7 } : {}}
                                />
                                {budget.isRecurring && (
                                  <Chip
                                    label="RECURRING"
                                    size="small"
                                    color="success"
                                    variant="outlined"
                                  />
                                )}
                                {isExpired(budget) && (
                                  <Chip
                                    label="EXPIRED"
                                    size="small"
                                    color="error"
                                    variant="outlined"
                                  />
                                )}
                              </Box>
                              {budget.currentUsage !== undefined && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  Current usage:{" "}
                                  {formatCurrency(
                                    budget.currentUsage.toString(),
                                  )}{" "}
                                  / {formatCurrency(budget.amountUsd)}
                                </Typography>
                              )}
                            </Box>
                          }
                          secondary={`Created ${new Date(budget.createdAt).toLocaleDateString()}${formatDateRange(budget)}`}
                        />
                        <ListItemSecondaryAction>
                          <IconButton
                            edge="end"
                            aria-label="edit"
                            onClick={() => handleStartEdit(budget)}
                            disabled={isPending}
                            sx={{ mr: 1 }}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            edge="end"
                            aria-label="delete"
                            onClick={() => handleDelete(budget.id)}
                            disabled={isPending}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                      {index < budgets.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        {/* Close button removed - only Cancel and Save/Update buttons needed */}
      </DialogActions>
    </Dialog>
  );
};

export default ManageBudgetsDialog;
