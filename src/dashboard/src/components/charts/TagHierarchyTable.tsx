import React, { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
  IconButton,
  Tooltip,
  Paper,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
} from "@mui/icons-material";
import { formatCurrency } from "../../utils/currency";
import type { TagUsageData, TagBudgetHealth } from "../../types";

type Order = "asc" | "desc";

interface TagHierarchyTableProps {
  usageData: TagUsageData[];
  budgetHealth: TagBudgetHealth[];
  title?: string;
}

interface HierarchicalTag extends TagUsageData {
  budgetInfo: TagBudgetHealth[]; // Changed to array to support multiple budgets
  children: HierarchicalTag[];
  level: number;
  parentId?: number;
}

const TagHierarchyTable: React.FC<TagHierarchyTableProps> = ({
  usageData,
  budgetHealth,
  title = "Tag Hierarchy",
}) => {
  const [orderBy, setOrderBy] = useState<keyof TagUsageData>("usage");
  const [order, setOrder] = useState<Order>("desc");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Build hierarchical structure from flat data
  const buildHierarchy = (): HierarchicalTag[] => {
    const tagMap = new Map<number, HierarchicalTag>();
    const rootTags: HierarchicalTag[] = [];

    // First pass: create all tag objects
    usageData.forEach((tag) => {
      const hierarchicalTag: HierarchicalTag = {
        ...tag,
        budgetInfo: budgetHealth.filter((budget) => budget.tagId === tag.tagId),
        children: [],
        level: 0,
      };
      tagMap.set(tag.tagId, hierarchicalTag);
    });

    // Second pass: build hierarchy based on path
    usageData.forEach((tag) => {
      const hierarchicalTag = tagMap.get(tag.tagId)!;
      const pathParts = tag.path.split("/");
      hierarchicalTag.level = pathParts.length - 1;

      if (pathParts.length === 1) {
        // Root level tag
        rootTags.push(hierarchicalTag);
      } else {
        // Child tag - find parent by matching path
        const parentPath = pathParts.slice(0, -1).join("/");
        const parentTag = Array.from(tagMap.values()).find(
          (t) => t.path === parentPath,
        );

        if (parentTag) {
          parentTag.children.push(hierarchicalTag);
          hierarchicalTag.parentId = parentTag.tagId;
        } else {
          // Parent not found, treat as root
          rootTags.push(hierarchicalTag);
        }
      }
    });

    return rootTags;
  };

  const hierarchicalData = buildHierarchy();

  // Sort function for hierarchical data
  const sortHierarchicalData = (data: HierarchicalTag[]): HierarchicalTag[] => {
    return data
      .map((tag) => ({
        ...tag,
        children: sortHierarchicalData(tag.children),
      }))
      .sort((a, b) => {
        const aValue = a[orderBy];
        const bValue = b[orderBy];

        if (typeof aValue === "number" && typeof bValue === "number") {
          return order === "asc" ? aValue - bValue : bValue - aValue;
        }

        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();

        if (order === "asc") {
          return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
        }
        return aStr > bStr ? -1 : aStr < bStr ? 1 : 0;
      });
  };

  const sortedData = sortHierarchicalData(hierarchicalData);

  const handleSort = (property: keyof TagUsageData) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
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

  const getBudgetStatusIcon = (status?: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircleIcon color="success" fontSize="small" />;
      case "warning":
        return <WarningIcon color="warning" fontSize="small" />;
      case "critical":
        return <ErrorIcon color="error" fontSize="small" />;
      default:
        return null;
    }
  };

  const getBudgetStatusColor = (status?: string) => {
    switch (status) {
      case "healthy":
        return "success";
      case "warning":
        return "warning";
      case "critical":
        return "error";
      default:
        return "default";
    }
  };

  // Recursive function to render tag rows
  const renderTagRows = (tags: HierarchicalTag[]): React.ReactNode[] => {
    const rows: React.ReactNode[] = [];

    tags.forEach((tag) => {
      const isExpanded = expandedRows.has(tag.tagId);
      const hasChildren = tag.children.length > 0;

      // Main tag row
      rows.push(
        <TableRow
          key={tag.tagId}
          hover
          sx={{
            "&:nth-of-type(odd)": {
              backgroundColor: (theme) =>
                theme.palette.mode === "dark"
                  ? "rgba(255, 255, 255, 0.02)"
                  : "action.hover",
            },
          }}
        >
          <TableCell>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                pl: tag.level * 2, // Indent based on hierarchy level
              }}
            >
              {hasChildren ? (
                <IconButton
                  size="small"
                  onClick={() => toggleRowExpansion(tag.tagId)}
                  sx={{ p: 0.25 }}
                >
                  {isExpanded ? (
                    <ExpandMoreIcon fontSize="small" />
                  ) : (
                    <ChevronRightIcon fontSize="small" />
                  )}
                </IconButton>
              ) : (
                <Box sx={{ width: 24 }} /> // Spacer for alignment
              )}

              {tag.color && (
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
                <Typography
                  variant="body2"
                  fontWeight={tag.level === 0 ? 600 : 500}
                  sx={{
                    color: tag.level === 0 ? "text.primary" : "text.secondary",
                  }}
                >
                  {tag.tagName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {tag.path}
                </Typography>
              </Box>
            </Box>
          </TableCell>

          <TableCell align="right">
            <Typography variant="body2" fontWeight={500}>
              {formatCurrency(tag.usage)}
            </Typography>
          </TableCell>

          <TableCell align="right">
            <Typography variant="body2">
              {tag.requests.toLocaleString()}
            </Typography>
          </TableCell>

          <TableCell align="right">
            <Typography variant="body2">
              {tag.percentage.toFixed(1)}%
            </Typography>
          </TableCell>

          <TableCell>
            {tag.budgetInfo.length > 0 ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {tag.budgetInfo.map((budget) => (
                  <Box
                    key={budget.budgetId}
                    sx={{ display: "flex", alignItems: "center", gap: 1 }}
                  >
                    {getBudgetStatusIcon(budget.status)}
                    <Chip
                      label={`${budget.percentage.toFixed(0)}%`}
                      size="small"
                      color={
                        getBudgetStatusColor(budget.status) as
                          | "success"
                          | "warning"
                          | "error"
                          | "default"
                      }
                      variant="outlined"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {formatCurrency(budget.usage)} /{" "}
                      {formatCurrency(budget.budget)}
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{ ml: 0.5, fontWeight: 500 }}
                      >
                        ({budget.period})
                      </Typography>
                    </Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="caption" color="text.secondary">
                No budget
              </Typography>
            )}
          </TableCell>

          <TableCell align="right">
            <Tooltip title="View Trends">
              <IconButton size="small" color="primary">
                <TrendingUpIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </TableCell>
        </TableRow>,
      );

      // Children rows (collapsed/expanded)
      if (hasChildren && isExpanded) {
        // Render children directly as table rows instead of nested in a single cell
        rows.push(...renderTagRows(tag.children));
      }
    });

    return rows;
  };

  return (
    <Card>
      <CardContent sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          {title}
        </Typography>

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
                <TableCell>
                  <TableSortLabel
                    active={orderBy === "tagName"}
                    direction={orderBy === "tagName" ? order : "asc"}
                    onClick={() => handleSort("tagName")}
                  >
                    <Typography variant="body2" fontWeight={600}>
                      Tag Hierarchy
                    </Typography>
                  </TableSortLabel>
                </TableCell>

                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === "usage"}
                    direction={orderBy === "usage" ? order : "asc"}
                    onClick={() => handleSort("usage")}
                  >
                    <Typography variant="body2" fontWeight={600}>
                      Usage
                    </Typography>
                  </TableSortLabel>
                </TableCell>

                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === "requests"}
                    direction={orderBy === "requests" ? order : "asc"}
                    onClick={() => handleSort("requests")}
                  >
                    <Typography variant="body2" fontWeight={600}>
                      Requests
                    </Typography>
                  </TableSortLabel>
                </TableCell>

                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === "percentage"}
                    direction={orderBy === "percentage" ? order : "asc"}
                    onClick={() => handleSort("percentage")}
                  >
                    <Typography variant="body2" fontWeight={600}>
                      Share
                    </Typography>
                  </TableSortLabel>
                </TableCell>

                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    Budget Status
                  </Typography>
                </TableCell>

                <TableCell align="right">
                  <Typography variant="body2" fontWeight={600}>
                    Actions
                  </Typography>
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>{renderTagRows(sortedData)}</TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
};

export default TagHierarchyTable;
