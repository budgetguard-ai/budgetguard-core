import React, { useState } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Menu,
  MenuItem,
  Paper,
  LinearProgress,
  Tooltip,
  Alert,
} from "@mui/material";
import {
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from "@mui/icons-material";
import { formatCurrency } from "../../utils/currency";
import type { Tag, TagBudget } from "../../types";

interface TagBudgetTableProps {
  budgets: TagBudget[];
  tags: Tag[];
  onEditBudget: (budget: TagBudget) => void;
  onDeleteBudget: (budget: TagBudget) => void;
  onToggleActive: (budget: TagBudget) => void;
}

const TagBudgetTable: React.FC<TagBudgetTableProps> = ({
  budgets,
  tags,
  onEditBudget,
  onDeleteBudget,
  onToggleActive,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedBudget, setSelectedBudget] = useState<TagBudget | null>(null);

  const handleMenuClick = (
    event: React.MouseEvent<HTMLElement>,
    budget: TagBudget,
  ) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedBudget(budget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedBudget(null);
  };

  const handleMenuAction = (action: () => void) => {
    action();
    handleMenuClose();
  };

  const getTagForBudget = (budget: TagBudget): Tag | undefined => {
    return tags.find((tag) => tag.id === budget.tagId);
  };

  const getBudgetStatus = (
    budget: TagBudget,
  ): { status: string; color: string; icon: React.ReactElement } => {
    const usage = budget.currentUsage || 0;
    const budgetAmount = parseFloat(budget.amountUsd);
    const percentage = budgetAmount > 0 ? (usage / budgetAmount) * 100 : 0;

    if (percentage >= 90) {
      return {
        status: "Critical",
        color: "error",
        icon: <ErrorIcon fontSize="small" />,
      };
    } else if (percentage >= 75) {
      return {
        status: "Warning",
        color: "warning",
        icon: <WarningIcon fontSize="small" />,
      };
    } else {
      return {
        status: "Healthy",
        color: "success",
        icon: <CheckCircleIcon fontSize="small" />,
      };
    }
  };

  const getUsagePercentage = (budget: TagBudget): number => {
    const usage = budget.currentUsage || 0;
    const budgetAmount = parseFloat(budget.amountUsd);
    return budgetAmount > 0 ? Math.min((usage / budgetAmount) * 100, 100) : 0;
  };

  const getInheritanceModeColor = (
    mode: string,
  ): "default" | "primary" | "secondary" | "success" | "warning" => {
    switch (mode) {
      case "STRICT":
        return "error" as "default";
      case "LENIENT":
        return "success";
      case "NONE":
        return "default";
      default:
        return "default";
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

  if (budgets.length === 0) {
    return (
      <Alert severity="info">
        No budgets found. Create budgets for your tags to track spending limits
        and get usage alerts.
      </Alert>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {budgets.filter((b) => b.isActive).length} active budgets,{" "}
          {budgets.filter((b) => !b.isActive).length} inactive
        </Typography>
      </Box>

      <TableContainer
        component={Paper}
        sx={{
          maxHeight: 600,
          backgroundColor: (theme) =>
            theme.palette.mode === "dark" ? "rgba(0, 0, 0, 0.3)" : undefined,
        }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Tag</TableCell>
              <TableCell>Budget</TableCell>
              <TableCell>Period</TableCell>
              <TableCell>Usage</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Weight</TableCell>
              <TableCell>Inheritance</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {budgets.map((budget) => {
              const tag = getTagForBudget(budget);
              const { status, color, icon } = getBudgetStatus(budget);
              const usagePercentage = getUsagePercentage(budget);

              return (
                <TableRow
                  key={budget.id}
                  hover
                  sx={{
                    "&:nth-of-type(odd)": {
                      backgroundColor: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(255, 255, 255, 0.02)"
                          : "action.hover",
                    },
                    opacity: budget.isActive ? 1 : 0.6,
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {tag?.color && (
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            backgroundColor: tag.color,
                          }}
                        />
                      )}
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {tag?.name || "Unknown Tag"}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontFamily: "monospace" }}
                        >
                          {tag?.path || tag?.name}
                        </Typography>
                      </Box>
                      {!budget.isActive && (
                        <Chip
                          label="Inactive"
                          size="small"
                          color="default"
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.6rem" }}
                        />
                      )}
                    </Box>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatCurrency(parseFloat(budget.amountUsd))}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">
                      {formatPeriod(
                        budget.period,
                        budget.startDate,
                        budget.endDate,
                      )}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Box sx={{ minWidth: 120 }}>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          mb: 0.5,
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {formatCurrency(budget.currentUsage || 0)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {usagePercentage.toFixed(1)}%
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={usagePercentage}
                        color={
                          color as
                            | "primary"
                            | "secondary"
                            | "error"
                            | "info"
                            | "success"
                            | "warning"
                        }
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                    </Box>
                  </TableCell>

                  <TableCell>
                    <Chip
                      icon={icon}
                      label={status}
                      size="small"
                      color={
                        color as
                          | "default"
                          | "primary"
                          | "secondary"
                          | "error"
                          | "info"
                          | "success"
                          | "warning"
                      }
                      variant="outlined"
                    />
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">
                      {budget.weight.toFixed(1)}x
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Chip
                      label={budget.inheritanceMode}
                      size="small"
                      color={getInheritanceModeColor(budget.inheritanceMode)}
                      variant="outlined"
                      sx={{ fontSize: "0.65rem" }}
                    />
                  </TableCell>

                  <TableCell align="center">
                    <Tooltip title="Actions">
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuClick(e, budget)}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: { minWidth: 160 },
        }}
      >
        {selectedBudget && (
          <>
            <MenuItem
              onClick={() =>
                handleMenuAction(() => onEditBudget(selectedBudget))
              }
            >
              <EditIcon fontSize="small" sx={{ mr: 1 }} />
              Edit Budget
            </MenuItem>

            <MenuItem
              onClick={() =>
                handleMenuAction(() => onToggleActive(selectedBudget))
              }
            >
              {selectedBudget.isActive ? (
                <>
                  <VisibilityOffIcon fontSize="small" sx={{ mr: 1 }} />
                  Deactivate
                </>
              ) : (
                <>
                  <VisibilityIcon fontSize="small" sx={{ mr: 1 }} />
                  Activate
                </>
              )}
            </MenuItem>

            <MenuItem
              onClick={() =>
                handleMenuAction(() => onDeleteBudget(selectedBudget))
              }
              sx={{ color: "error.main" }}
            >
              <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
              Delete Budget
            </MenuItem>
          </>
        )}
      </Menu>
    </Box>
  );
};

export default TagBudgetTable;
