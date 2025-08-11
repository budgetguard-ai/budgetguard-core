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
  Paper,
  Tooltip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Add as AddIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  AccountBalance as BudgetManageIcon,
} from "@mui/icons-material";
import { formatCurrency } from "../../utils/currency";
import type { Tag, TagBudget } from "../../types";

interface TagNode extends Tag {
  children: TagNode[];
  level: number;
  budgets: TagBudget[];
}

interface UnifiedTagTableProps {
  tags: Tag[];
  budgets: TagBudget[];
  onEditTag: (tag: Tag) => void;
  onDeleteTag: (tag: Tag) => void;
  onToggleTagActive: (tag: Tag) => void;
  onCreateChild: (parentTag: Tag) => void;
  onCreateBudget: (tag: Tag) => void;
}

const UnifiedTagTable: React.FC<UnifiedTagTableProps> = ({
  tags,
  budgets,
  onEditTag,
  onDeleteTag,
  onToggleTagActive,
  onCreateChild,
  onCreateBudget,
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [selectedTagForAction, setSelectedTagForAction] = useState<Tag | null>(
    null,
  );

  const buildTree = (): TagNode[] => {
    const tagMap = new Map<number, TagNode>();
    const rootNodes: TagNode[] = [];

    // First pass: Create all nodes
    tags.forEach((tag) => {
      const tagBudgets = budgets.filter((budget) => budget.tagId === tag.id);
      tagMap.set(tag.id, {
        ...tag,
        children: [],
        level: 0,
        budgets: tagBudgets,
      });
    });

    // Second pass: Build hierarchy
    tags.forEach((tag) => {
      const node = tagMap.get(tag.id)!;

      if (tag.parentId) {
        const parent = tagMap.get(tag.parentId);
        if (parent) {
          parent.children.push(node);
          node.level = parent.level + 1;
        }
      } else {
        rootNodes.push(node);
      }
    });

    return rootNodes;
  };

  const toggleRowExpansion = (tagId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(tagId)) {
      newExpanded.delete(tagId);
    } else {
      newExpanded.add(tagId);
    }
    setExpandedRows(newExpanded);
  };

  const handleDeleteClick = (tag: Tag) => {
    setSelectedTagForAction(tag);
    setDeleteConfirmOpen(true);
  };

  const handleDeactivateClick = (tag: Tag) => {
    if (tag.isActive) {
      setSelectedTagForAction(tag);
      setDeactivateConfirmOpen(true);
    } else {
      // If it's already inactive, activate without confirmation
      onToggleTagActive(tag);
    }
  };

  const handleConfirmDelete = () => {
    if (selectedTagForAction) {
      onDeleteTag(selectedTagForAction);
    }
    setDeleteConfirmOpen(false);
    setSelectedTagForAction(null);
  };

  const handleConfirmDeactivate = () => {
    if (selectedTagForAction) {
      onToggleTagActive(selectedTagForAction);
    }
    setDeactivateConfirmOpen(false);
    setSelectedTagForAction(null);
  };

  const handleCancelAction = () => {
    setDeleteConfirmOpen(false);
    setDeactivateConfirmOpen(false);
    setSelectedTagForAction(null);
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

  const renderTagRows = (nodes: TagNode[]): React.ReactNode[] => {
    const rows: React.ReactNode[] = [];

    nodes.forEach((node) => {
      const isExpanded = expandedRows.has(node.id);
      const hasChildren = node.children.length > 0;
      const activeBudgets = node.budgets.filter((budget) => budget.isActive);

      // Main tag row
      rows.push(
        <TableRow
          key={`tag-${node.id}`}
          hover
          sx={{
            "&:nth-of-type(odd)": {
              backgroundColor: (theme) =>
                theme.palette.mode === "dark"
                  ? "rgba(255, 255, 255, 0.02)"
                  : "action.hover",
            },
            opacity: node.isActive ? 1 : 0.6,
          }}
        >
          <TableCell>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                pl: node.level * 2,
              }}
            >
              {hasChildren ? (
                <IconButton
                  size="small"
                  onClick={() => toggleRowExpansion(node.id)}
                  sx={{ p: 0.25 }}
                >
                  {isExpanded ? (
                    <ExpandMoreIcon fontSize="small" />
                  ) : (
                    <ChevronRightIcon fontSize="small" />
                  )}
                </IconButton>
              ) : (
                <Box sx={{ width: 24 }} />
              )}

              {node.color && (
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor: node.color,
                  }}
                />
              )}

              <Box>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: node.level === 0 ? 600 : 500 }}
                >
                  {node.name}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontFamily: "monospace" }}
                >
                  {node.path || node.name}
                </Typography>
                {!node.isActive && (
                  <Chip
                    label="Inactive"
                    size="small"
                    color="default"
                    variant="outlined"
                    sx={{ height: 18, fontSize: "0.6rem", ml: 1 }}
                  />
                )}
              </Box>
            </Box>
          </TableCell>

          <TableCell>
            {node.description && (
              <Typography variant="body2" color="text.secondary">
                {node.description}
              </Typography>
            )}
          </TableCell>

          <TableCell>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {activeBudgets.length > 0 ? (
                activeBudgets.map((budget) => (
                  <Box
                    key={budget.id}
                    sx={{ display: "flex", alignItems: "center", gap: 1 }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
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
                    <Typography variant="caption" color="text.secondary">
                      Weight: {budget.weight.toFixed(1)}x |{" "}
                      {budget.inheritanceMode}
                    </Typography>
                    {!budget.isActive && (
                      <Chip
                        label="Inactive"
                        size="small"
                        color="default"
                        sx={{ height: 18, fontSize: "0.6rem" }}
                      />
                    )}
                  </Box>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No active budgets
                </Typography>
              )}
            </Box>
          </TableCell>

          <TableCell>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Tooltip title="Manage Budgets">
                <IconButton
                  size="small"
                  onClick={() => onCreateBudget(node)}
                  color="primary"
                >
                  <BudgetManageIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Edit Tag">
                <IconButton
                  size="small"
                  onClick={() => onEditTag(node)}
                  color="default"
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Add Child Tag">
                <IconButton
                  size="small"
                  onClick={() => onCreateChild(node)}
                  color="success"
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title={node.isActive ? "Deactivate" : "Activate"}>
                <IconButton
                  size="small"
                  onClick={() => handleDeactivateClick(node)}
                  color="warning"
                >
                  {node.isActive ? (
                    <VisibilityOffIcon fontSize="small" />
                  ) : (
                    <VisibilityIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>

              <Tooltip title="Delete Tag">
                <IconButton
                  size="small"
                  onClick={() => handleDeleteClick(node)}
                  color="error"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </TableCell>
        </TableRow>,
      );

      // Children rows
      if (hasChildren && isExpanded) {
        rows.push(...renderTagRows(node.children));
      }
    });

    return rows;
  };

  const hierarchicalData = buildTree();

  if (tags.length === 0) {
    return (
      <Alert severity="info">
        No tags found. Create your first tag to start organizing your budget
        tracking.
      </Alert>
    );
  }

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {tags.filter((t) => t.isActive).length} active tags,{" "}
          {budgets.filter((b) => b.isActive).length} active budgets
        </Typography>
      </Box>

      <TableContainer
        component={Paper}
        sx={{
          width: "100%",
          maxHeight: 700,
          backgroundColor: (theme) =>
            theme.palette.mode === "dark" ? "rgba(0, 0, 0, 0.3)" : undefined,
        }}
      >
        <Table
          size="small"
          stickyHeader
          sx={{ tableLayout: "fixed", width: "100%" }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: "25%" }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Tag Hierarchy
                </Typography>
              </TableCell>
              <TableCell sx={{ width: "20%" }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Description
                </Typography>
              </TableCell>
              <TableCell sx={{ width: "35%" }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Budget Status
                </Typography>
              </TableCell>
              <TableCell align="center" sx={{ width: "20%" }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Actions
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>{renderTagRows(hierarchicalData)}</TableBody>
        </Table>
      </TableContainer>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleCancelAction}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: "error.main" }}>Delete Tag</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              This action cannot be undone. The tag and all its associated data
              will be permanently deleted.
            </Alert>

            <Typography variant="body1" sx={{ mb: 2 }}>
              You are about to delete the tag{" "}
              <strong>{selectedTagForAction?.name}</strong>
              {selectedTagForAction?.path && (
                <span> ({selectedTagForAction.path})</span>
              )}
              .
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              This will permanently delete:
            </Typography>

            <Box component="ul" sx={{ mb: 2, pl: 2 }}>
              <Typography component="li" variant="body2" color="text.secondary">
                The tag and all its metadata
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                All budgets associated with this tag
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                All usage data and history for this tag
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                All child tags and their associated data
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelAction}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            variant="contained"
            color="error"
          >
            Delete Tag
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <Dialog
        open={deactivateConfirmOpen}
        onClose={handleCancelAction}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Deactivate Tag</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Are you sure you want to deactivate the tag{" "}
              <strong>{selectedTagForAction?.name}</strong>
              {selectedTagForAction?.path && (
                <span> ({selectedTagForAction.path})</span>
              )}
              ?
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Deactivating a tag will:
            </Typography>

            <Box component="ul" sx={{ mb: 2, pl: 2 }}>
              <Typography component="li" variant="body2" color="text.secondary">
                Stop tracking new usage for this tag
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                Keep existing data and budgets intact
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                Allow you to reactivate it later
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelAction}>Cancel</Button>
          <Button
            onClick={handleConfirmDeactivate}
            variant="contained"
            color="warning"
          >
            Deactivate Tag
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UnifiedTagTable;
