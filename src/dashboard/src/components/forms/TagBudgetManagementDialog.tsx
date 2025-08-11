import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Slider,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  Chip,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  AttachMoney as MoneyIcon,
} from "@mui/icons-material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { apiClient } from "../../services/api";
import { formatCurrency } from "../../utils/currency";
import type {
  Tag,
  TagBudget,
  CreateTagBudgetRequest,
  UpdateTagBudgetRequest,
} from "../../types";

interface TagBudgetManagementDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (budget: TagBudget) => void;
  onBudgetUpdate: (budget: TagBudget) => void;
  onBudgetDelete: (budgetId: number) => void;
  tenantId: number;
  selectedTag: Tag;
  existingBudgets: TagBudget[];
}

const TagBudgetManagementDialog: React.FC<TagBudgetManagementDialogProps> = ({
  open,
  onClose,
  onSuccess,
  onBudgetUpdate,
  onBudgetDelete,
  tenantId,
  selectedTag,
  existingBudgets,
}) => {
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingBudget, setEditingBudget] = useState<TagBudget | null>(null);
  const [formData, setFormData] = useState<CreateTagBudgetRequest>({
    tagId: selectedTag.id,
    period: "monthly",
    amountUsd: 100,
    weight: 1.0,
    inheritanceMode: "LENIENT",
    startDate: undefined,
    endDate: undefined,
  });
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter budgets for this specific tag
  const tagBudgets = existingBudgets.filter(
    (budget) => budget.tagId === selectedTag.id,
  );

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setMode("list");
      setEditingBudget(null);
      resetForm();
    }
  }, [open, selectedTag]);

  const resetForm = () => {
    setFormData({
      tagId: selectedTag.id,
      period: "monthly",
      amountUsd: 100,
      weight: 1.0,
      inheritanceMode: "LENIENT",
      startDate: undefined,
      endDate: undefined,
    });
    setStartDate(null);
    setEndDate(null);
    setError(null);
  };

  const handleInputChange = (
    field: keyof CreateTagBudgetRequest,
    value: unknown,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleCreateNew = () => {
    resetForm();
    setMode("create");
  };

  const handleEditBudget = (budget: TagBudget) => {
    setEditingBudget(budget);
    setFormData({
      tagId: budget.tagId,
      period: budget.period,
      amountUsd: parseFloat(budget.amountUsd),
      weight: budget.weight,
      inheritanceMode: budget.inheritanceMode,
      startDate: budget.startDate,
      endDate: budget.endDate,
    });
    setStartDate(budget.startDate ? new Date(budget.startDate) : null);
    setEndDate(budget.endDate ? new Date(budget.endDate) : null);
    setMode("edit");
  };

  const handleSubmit = async () => {
    if (formData.amountUsd <= 0) {
      setError("Budget amount must be greater than 0");
      return;
    }

    if (formData.period === "custom" && (!startDate || !endDate)) {
      setError("Start date and end date are required for custom periods");
      return;
    }

    if (startDate && endDate && startDate >= endDate) {
      setError("End date must be after start date");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const budgetData: CreateTagBudgetRequest = {
        ...formData,
        startDate:
          formData.period === "custom" ? startDate?.toISOString() : undefined,
        endDate:
          formData.period === "custom" ? endDate?.toISOString() : undefined,
      };

      if (mode === "edit" && editingBudget) {
        // Create update request without tagId
        const updateData: UpdateTagBudgetRequest = {
          period: budgetData.period,
          amountUsd: budgetData.amountUsd,
          weight: budgetData.weight,
          inheritanceMode: budgetData.inheritanceMode,
          startDate: budgetData.startDate,
          endDate: budgetData.endDate,
        };

        const updatedBudget = await apiClient.updateTagBudget(
          tenantId,
          editingBudget.id,
          updateData,
        );
        onBudgetUpdate(updatedBudget);
      } else {
        const newBudget = await apiClient.createTagBudget(tenantId, budgetData);
        onSuccess(newBudget);
      }

      setMode("list");
      resetForm();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to save budget";
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBudget = async (budget: TagBudget) => {
    if (
      !confirm(
        `Are you sure you want to delete the ${budget.period} budget of ${formatCurrency(parseFloat(budget.amountUsd))}?`,
      )
    ) {
      return;
    }

    try {
      await apiClient.deleteTagBudget(tenantId, budget.id);
      onBudgetDelete(budget.id);
    } catch (err) {
      console.error("Failed to delete budget:", err);
    }
  };

  const handleToggleBudgetActive = async (budget: TagBudget) => {
    try {
      const updatedBudget = await apiClient.updateTagBudget(
        tenantId,
        budget.id,
        {
          isActive: !budget.isActive,
        },
      );
      onBudgetUpdate(updatedBudget);
    } catch (err) {
      console.error("Failed to toggle budget status:", err);
    }
  };

  const formatPeriod = (
    period: string,
    startDate?: string,
    endDate?: string,
  ): string => {
    if (period === "custom" && startDate && endDate) {
      const start = new Date(startDate).toLocaleDateString();
      const end = new Date(endDate).toLocaleDateString();
      return `${start} - ${end}`;
    }
    return period.charAt(0).toUpperCase() + period.slice(1);
  };

  const getPeriodDescription = () => {
    switch (formData.period) {
      case "daily":
        return "Budget resets every day";
      case "monthly":
        return "Budget resets every month";
      case "custom":
        return "Budget applies only to the specified date range";
      default:
        return "";
    }
  };

  const getInheritanceModeDescription = () => {
    switch (formData.inheritanceMode) {
      case "STRICT":
        return "Child tags inherit this budget and cannot exceed it";
      case "LENIENT":
        return "Child tags can have their own budgets in addition to this one";
      case "NONE":
        return "Child tags do not inherit this budget";
      default:
        return "";
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {selectedTag.color && (
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  backgroundColor: selectedTag.color,
                }}
              />
            )}
            Budget Management - {selectedTag.name}
          </Box>
        </DialogTitle>

        <DialogContent>
          {mode === "list" && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Typography variant="h6">Existing Budgets</Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleCreateNew}
                >
                  Create New Budget
                </Button>
              </Box>

              {tagBudgets.length === 0 ? (
                <Alert severity="info">
                  No budgets found for this tag. Create your first budget to
                  start tracking spending limits.
                </Alert>
              ) : (
                <List>
                  {tagBudgets.map((budget, index) => {
                    return (
                      <React.Fragment key={budget.id}>
                        <ListItem
                          sx={{
                            opacity: budget.isActive ? 1 : 0.6,
                            borderRadius: 1,
                            border: "1px solid",
                            borderColor: "divider",
                            mb: 1,
                          }}
                        >
                          <ListItemIcon>
                            <MoneyIcon color="primary" />
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                <Typography
                                  variant="subtitle1"
                                  fontWeight={600}
                                >
                                  {formatCurrency(parseFloat(budget.amountUsd))}
                                </Typography>
                                <Chip
                                  label={formatPeriod(
                                    budget.period,
                                    budget.startDate,
                                    budget.endDate,
                                  )}
                                  size="small"
                                  variant="outlined"
                                />
                                {!budget.isActive && (
                                  <Chip
                                    label="Inactive"
                                    size="small"
                                    color="default"
                                  />
                                )}
                              </Box>
                            }
                            secondary={
                              <Box sx={{ mt: 1 }}>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Weight: {budget.weight.toFixed(1)}x |
                                  Inheritance: {budget.inheritanceMode}
                                </Typography>
                              </Box>
                            }
                          />
                          <ListItemSecondaryAction>
                            <Box sx={{ display: "flex", gap: 0.5 }}>
                              <IconButton
                                size="small"
                                onClick={() => handleEditBudget(budget)}
                                color="primary"
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => handleToggleBudgetActive(budget)}
                                color="warning"
                              >
                                {budget.isActive ? (
                                  <VisibilityOffIcon fontSize="small" />
                                ) : (
                                  <VisibilityIcon fontSize="small" />
                                )}
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteBudget(budget)}
                                color="error"
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </ListItemSecondaryAction>
                        </ListItem>
                        {index < tagBudgets.length - 1 && <Divider />}
                      </React.Fragment>
                    );
                  })}
                </List>
              )}
            </Box>
          )}

          {(mode === "create" || mode === "edit") && (
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}
            >
              {error && (
                <Alert severity="error" onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField
                  label="Budget Amount"
                  type="number"
                  value={formData.amountUsd}
                  onChange={(e) =>
                    handleInputChange(
                      "amountUsd",
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  required
                  fullWidth
                  inputProps={{ min: 0, step: 0.01 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">$</InputAdornment>
                    ),
                  }}
                  helperText="USD amount for this budget period"
                />

                <FormControl fullWidth>
                  <InputLabel>Period</InputLabel>
                  <Select
                    value={formData.period}
                    label="Period"
                    onChange={(e) =>
                      handleInputChange("period", e.target.value)
                    }
                  >
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                    <MenuItem value="custom">Custom Date Range</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              {formData.period === "custom" && (
                <Box sx={{ display: "flex", gap: 2 }}>
                  <DatePicker
                    label="Start Date"
                    value={startDate}
                    onChange={(date) => setStartDate(date)}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                  <DatePicker
                    label="End Date"
                    value={endDate}
                    onChange={(date) => setEndDate(date)}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </Box>
              )}

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Weight: {(formData.weight || 1.0).toFixed(1)}x
                </Typography>
                <Slider
                  value={formData.weight}
                  onChange={(_e, value) =>
                    handleInputChange("weight", (value as number) || 1.0)
                  }
                  min={0.1}
                  max={3.0}
                  step={0.1}
                  marks={[
                    { value: 0.5, label: "0.5x" },
                    { value: 1.0, label: "1.0x" },
                    { value: 1.5, label: "1.5x" },
                    { value: 2.0, label: "2.0x" },
                  ]}
                  valueLabelDisplay="auto"
                />
                <Typography variant="caption" color="text.secondary">
                  Multiplier for usage costs when tracking against this budget
                </Typography>
              </Box>

              <FormControl fullWidth>
                <InputLabel>Inheritance Mode</InputLabel>
                <Select
                  value={formData.inheritanceMode}
                  label="Inheritance Mode"
                  onChange={(e) =>
                    handleInputChange("inheritanceMode", e.target.value)
                  }
                >
                  <MenuItem value="STRICT">Strict</MenuItem>
                  <MenuItem value="LENIENT">Lenient</MenuItem>
                  <MenuItem value="NONE">None</MenuItem>
                </Select>
              </FormControl>

              <Box
                sx={{
                  p: 2,
                  backgroundColor: "info.main",
                  color: "info.contrastText",
                  borderRadius: 1,
                  "& .MuiTypography-root": {
                    color: "inherit",
                  },
                }}
              >
                <Typography variant="subtitle2" gutterBottom>
                  Period: {getPeriodDescription()}
                </Typography>
                <Typography variant="subtitle2">
                  Inheritance: {getInheritanceModeDescription()}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          {mode === "list" ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button
                onClick={() => {
                  setMode("list");
                  resetForm();
                }}
                disabled={isSubmitting}
              >
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                variant="contained"
                disabled={isSubmitting || formData.amountUsd <= 0}
                startIcon={isSubmitting ? <CircularProgress size={16} /> : null}
              >
                {isSubmitting
                  ? mode === "edit"
                    ? "Updating..."
                    : "Creating..."
                  : mode === "edit"
                    ? "Update Budget"
                    : "Create Budget"}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  );
};

export default TagBudgetManagementDialog;
