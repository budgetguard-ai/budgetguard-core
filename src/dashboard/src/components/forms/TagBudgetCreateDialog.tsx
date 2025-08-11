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
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { apiClient } from "../../services/api";
import type { Tag, TagBudget, CreateTagBudgetRequest } from "../../types";

interface TagBudgetCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (budget: TagBudget) => void;
  tenantId: number;
  availableTags: Tag[];
  existingBudgets: TagBudget[];
  preselectedTag?: Tag | null;
}

const TagBudgetCreateDialog: React.FC<TagBudgetCreateDialogProps> = ({
  open,
  onClose,
  onSuccess,
  tenantId,
  availableTags,
  existingBudgets,
  preselectedTag = null,
}) => {
  const [formData, setFormData] = useState<CreateTagBudgetRequest>({
    tagId: preselectedTag?.id || 0,
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

  // Update form data when preselected tag changes
  useEffect(() => {
    if (preselectedTag && open) {
      setFormData((prev) => ({
        ...prev,
        tagId: preselectedTag.id,
      }));
    }
  }, [preselectedTag, open]);

  // Filter tags that don't already have active budgets (but allow preselected tag)
  const tagsWithoutBudgets = availableTags.filter(
    (tag) =>
      tag.isActive &&
      (tag.id === preselectedTag?.id ||
        !existingBudgets.some(
          (budget) => budget.tagId === tag.id && budget.isActive,
        )),
  );

  const handleInputChange = (
    field: keyof CreateTagBudgetRequest,
    value: unknown,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async () => {
    if (!formData.tagId) {
      setError("Please select a tag");
      return;
    }

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

      const newBudget = await apiClient.createTagBudget(tenantId, budgetData);
      onSuccess(newBudget);
      handleClose();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create budget";
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        tagId: 0,
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
      onClose();
    }
  };

  const getSelectedTag = () => {
    return availableTags.find((tag) => tag.id === formData.tagId);
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
      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Create Tag Budget</DialogTitle>

        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <FormControl fullWidth required>
              <InputLabel>Tag</InputLabel>
              <Select
                value={formData.tagId || ""}
                label="Tag"
                onChange={(e) =>
                  handleInputChange("tagId", Number(e.target.value))
                }
              >
                {tagsWithoutBudgets.length === 0 ? (
                  <MenuItem disabled>
                    <em>All active tags already have budgets</em>
                  </MenuItem>
                ) : (
                  tagsWithoutBudgets.map((tag) => (
                    <MenuItem key={tag.id} value={tag.id}>
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            backgroundColor: tag.color || "#666",
                          }}
                        />
                        {tag.path || tag.name}
                      </Box>
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>

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
                  onChange={(e) => handleInputChange("period", e.target.value)}
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

            {/* Info Boxes */}
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

            {getSelectedTag() && (
              <Box
                sx={{
                  p: 2,
                  backgroundColor: "action.hover",
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Typography variant="subtitle2" gutterBottom>
                  Selected Tag:
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      backgroundColor: getSelectedTag()?.color || "#666",
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: "monospace", fontWeight: 500 }}
                  >
                    {getSelectedTag()?.path || getSelectedTag()?.name}
                  </Typography>
                </Box>
                {getSelectedTag()?.description && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 0.5, display: "block" }}
                  >
                    {getSelectedTag()?.description}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={
              isSubmitting || !formData.tagId || formData.amountUsd <= 0
            }
            startIcon={isSubmitting ? <CircularProgress size={16} /> : null}
          >
            {isSubmitting ? "Creating..." : "Create Budget"}
          </Button>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  );
};

export default TagBudgetCreateDialog;
