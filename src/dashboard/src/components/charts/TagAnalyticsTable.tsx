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
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
} from "@mui/icons-material";
import { formatCurrency } from "../../utils/currency";
import type { TagUsageData, TagBudgetHealth } from "../../types";

type Order = "asc" | "desc";

interface TagAnalyticsTableProps {
  usageData: TagUsageData[];
  budgetHealth: TagBudgetHealth[];
  title?: string;
  compact?: boolean;
}

interface TableData extends TagUsageData {
  budgetInfo?: TagBudgetHealth;
}

const TagAnalyticsTable: React.FC<TagAnalyticsTableProps> = ({
  usageData,
  budgetHealth,
  title = "Tag Analytics",
  compact = false,
}) => {
  const [orderBy, setOrderBy] = useState<keyof TagUsageData>("usage");
  const [order, setOrder] = useState<Order>("desc");

  // Merge usage data with budget health info
  const tableData: TableData[] = usageData.map((usage) => ({
    ...usage,
    budgetInfo: budgetHealth.find((budget) => budget.tagId === usage.tagId),
  }));

  const handleSort = (property: keyof TagUsageData) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  const sortedData = tableData.sort((a, b) => {
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

  return (
    <Card>
      <CardContent sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          {title}
        </Typography>

        <TableContainer
          component={Paper}
          sx={{ maxHeight: compact ? 400 : 600 }}
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
                      Tag
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

            <TableBody>
              {sortedData.map((row) => (
                <TableRow
                  key={row.tagId}
                  hover
                  sx={{
                    "&:nth-of-type(odd)": {
                      backgroundColor: "action.hover",
                    },
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {row.color && (
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            backgroundColor: row.color,
                          }}
                        />
                      )}
                      <Box>
                        <Typography variant="body2" fontWeight={500}>
                          {row.tagName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.path}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>

                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={500}>
                      {formatCurrency(row.usage)}
                    </Typography>
                  </TableCell>

                  <TableCell align="right">
                    <Typography variant="body2">
                      {row.requests.toLocaleString()}
                    </Typography>
                  </TableCell>

                  <TableCell align="right">
                    <Typography variant="body2">
                      {row.percentage.toFixed(1)}%
                    </Typography>
                  </TableCell>

                  <TableCell>
                    {row.budgetInfo ? (
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        {getBudgetStatusIcon(row.budgetInfo.status)}
                        <Chip
                          label={`${row.budgetInfo.percentage.toFixed(0)}%`}
                          size="small"
                          color={
                            getBudgetStatusColor(row.budgetInfo.status) as
                              | "success"
                              | "warning"
                              | "error"
                              | "default"
                          }
                          variant="outlined"
                        />
                        <Typography variant="caption" color="text.secondary">
                          {formatCurrency(row.budgetInfo.usage)} /{" "}
                          {formatCurrency(row.budgetInfo.budget)}
                        </Typography>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
};

export default TagAnalyticsTable;
