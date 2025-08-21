import React, { useState, useMemo } from "react";
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
  TablePagination,
  TableSortLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
} from "@mui/material";
import {
  Download as DownloadIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
} from "@mui/icons-material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { useUsageLedger } from "../hooks/useApi";
import type { UsageLedger } from "../types";

type Order = "asc" | "desc";

interface HeadCell {
  id: keyof UsageLedger;
  label: string;
  numeric: boolean;
  sortable: boolean;
}

const headCells: HeadCell[] = [
  { id: "ts", label: "Date/Time", numeric: false, sortable: true },
  { id: "tenant", label: "Tenant", numeric: false, sortable: true },
  { id: "route", label: "Route", numeric: false, sortable: false },
  { id: "model", label: "Model", numeric: false, sortable: true },
  { id: "sessionId", label: "Session", numeric: false, sortable: false },
  { id: "status", label: "Status", numeric: false, sortable: true },
  { id: "promptTok", label: "Input", numeric: true, sortable: true },
  { id: "compTok", label: "Output", numeric: true, sortable: true },
  { id: "usd", label: "Cost", numeric: true, sortable: true },
  { id: "tags", label: "Tags", numeric: false, sortable: false },
];

const UsageTracking: React.FC = () => {
  // Table state
  const [order, setOrder] = useState<Order>("desc");
  const [orderBy, setOrderBy] = useState<keyof UsageLedger>("ts");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Filter state
  const [filters, setFilters] = useState({
    tenant: "",
    route: "",
    model: "",
    status: "" as "" | "success" | "blocked" | "failed",
    startDate: null as Date | null,
    endDate: null as Date | null,
    minCost: "",
    maxCost: "",
  });

  // Build API parameters from current state
  const apiParams = useMemo(() => {
    const params: Record<string, string | number> = {
      page,
      limit: rowsPerPage,
    };

    if (filters.tenant) params.tenant = filters.tenant;
    if (filters.route) params.route = filters.route;
    if (filters.model) params.model = filters.model;
    if (filters.status) params.status = filters.status;
    if (filters.startDate)
      params.startDate = filters.startDate.toISOString().split("T")[0];
    if (filters.endDate)
      params.endDate = filters.endDate.toISOString().split("T")[0];

    return params;
  }, [page, rowsPerPage, filters]);

  // Fetch usage ledger data
  const {
    data: usageLedgerResponse,
    isLoading,
    error: ledgerError,
  } = useUsageLedger(apiParams);

  const handleRequestSort = (property: keyof UsageLedger) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleFilterChange = (key: string, value: string | Date | null) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0); // Reset to first page when filtering
  };

  const clearFilters = () => {
    setFilters({
      tenant: "",
      route: "",
      model: "",
      status: "" as const,
      startDate: null,
      endDate: null,
      minCost: "",
      maxCost: "",
    });
    setPage(0);
  };

  const exportData = () => {
    const data = usageLedgerResponse?.data || [];
    const csv = [
      [
        "Date",
        "Time",
        "Tenant",
        "Route",
        "Model",
        "Session ID",
        "Status",
        "Input Tokens",
        "Output Tokens",
        "Cost (USD)",
        "Tags",
      ],
      ...data.map((row) => [
        new Date(row.ts).toLocaleDateString(),
        new Date(row.ts).toLocaleTimeString(),
        row.tenant,
        row.route,
        row.model,
        row.sessionId || "",
        row.status,
        row.promptTok.toString(),
        row.compTok.toString(),
        `$${parseFloat(row.usd)}`,
        row.tags.map((tag) => tag.name).join("; "),
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage-history-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get data from API response
  const usageData: UsageLedger[] = usageLedgerResponse?.data || [];
  const totalCount = usageLedgerResponse?.total || 0;

  // Client-side filtering for cost range (since this isn't supported by the API)
  const clientFilteredData = useMemo<UsageLedger[]>(() => {
    let data = usageData;

    if (filters.minCost) {
      const minCost = parseFloat(filters.minCost);
      if (!isNaN(minCost)) {
        data = data.filter((row) => parseFloat(row.usd) >= minCost);
      }
    }

    if (filters.maxCost) {
      const maxCost = parseFloat(filters.maxCost);
      if (!isNaN(maxCost)) {
        data = data.filter((row) => parseFloat(row.usd) <= maxCost);
      }
    }

    return data.sort((a, b) => {
      // Ensure orderBy is a valid key of UsageLedger
      if (!(orderBy in a) || !(orderBy in b)) {
        return 0;
      }

      let aVal: string | number | Date = a[orderBy] as string | number | Date;
      let bVal: string | number | Date = b[orderBy] as string | number | Date;

      // Handle different data types
      if (orderBy === "ts") {
        aVal = new Date(a.ts).getTime();
        bVal = new Date(b.ts).getTime();
      } else if (orderBy === "usd") {
        aVal = parseFloat(a.usd);
        bVal = parseFloat(b.usd);
      } else if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }

      if (order === "asc") {
        return (aVal || 0) < (bVal || 0)
          ? -1
          : (aVal || 0) > (bVal || 0)
            ? 1
            : 0;
      } else {
        return (aVal || 0) > (bVal || 0)
          ? -1
          : (aVal || 0) < (bVal || 0)
            ? 1
            : 0;
      }
    });
  }, [usageData, filters.minCost, filters.maxCost, order, orderBy]);

  const activeFiltersCount = Object.values(filters).filter(
    (value) => value !== null && value !== "",
  ).length;

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 4,
          }}
        >
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            Usage Tracking
          </Typography>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={exportData}
              disabled={clientFilteredData.length === 0}
            >
              Export CSV
            </Button>
          </Box>
        </Box>

        {/* Filters */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <FilterIcon />
              <Typography variant="subtitle1">Filters</Typography>
              {activeFiltersCount > 0 && (
                <Chip
                  label={`${activeFiltersCount} active`}
                  size="small"
                  color="primary"
                />
              )}
              {activeFiltersCount > 0 && (
                <Tooltip title="Clear all filters">
                  <IconButton size="small" onClick={clearFilters}>
                    <ClearIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 1.5,
              }}
            >
              <TextField
                label="Tenant"
                value={filters.tenant}
                onChange={(e) => handleFilterChange("tenant", e.target.value)}
                size="small"
                placeholder="Search tenant..."
              />

              <FormControl size="small">
                <InputLabel>Route</InputLabel>
                <Select
                  value={filters.route}
                  label="Route"
                  onChange={(e) => handleFilterChange("route", e.target.value)}
                >
                  <MenuItem value="">All Routes</MenuItem>
                  <MenuItem value="/v1/chat/completions">
                    Chat Completions
                  </MenuItem>
                  <MenuItem value="/v1/responses">Responses</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Model"
                value={filters.model}
                onChange={(e) => handleFilterChange("model", e.target.value)}
                size="small"
                placeholder="Search models..."
              />

              <FormControl size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.status}
                  label="Status"
                  onChange={(e) => handleFilterChange("status", e.target.value)}
                >
                  <MenuItem value="">All Status</MenuItem>
                  <MenuItem value="success">Success</MenuItem>
                  <MenuItem value="blocked">Blocked</MenuItem>
                  <MenuItem value="failed">Failed</MenuItem>
                </Select>
              </FormControl>

              <DatePicker
                label="Start Date"
                value={filters.startDate}
                onChange={(date) => handleFilterChange("startDate", date)}
                slotProps={{ textField: { size: "small" } }}
              />

              <DatePicker
                label="End Date"
                value={filters.endDate}
                onChange={(date) => handleFilterChange("endDate", date)}
                slotProps={{ textField: { size: "small" } }}
              />

              <TextField
                label="Min Cost ($)"
                type="number"
                value={filters.minCost}
                onChange={(e) => handleFilterChange("minCost", e.target.value)}
                size="small"
                inputProps={{ step: 0.001, min: 0 }}
              />

              <TextField
                label="Max Cost ($)"
                type="number"
                value={filters.maxCost}
                onChange={(e) => handleFilterChange("maxCost", e.target.value)}
                size="small"
                inputProps={{ step: 0.001, min: 0 }}
              />
            </Box>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardContent sx={{ p: 0 }}>
            {isLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress />
              </Box>
            ) : ledgerError ? (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <Alert severity="error">
                  Failed to load usage history: {ledgerError.message}
                </Alert>
              </Box>
            ) : clientFilteredData.length === 0 ? (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <Alert severity="info">
                  No usage history found matching your filters.
                </Alert>
              </Box>
            ) : (
              <>
                <TableContainer sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {headCells.map((headCell) => (
                          <TableCell
                            key={headCell.id}
                            align={headCell.numeric ? "right" : "left"}
                            sortDirection={
                              orderBy === headCell.id ? order : false
                            }
                            sx={{ py: 1, fontWeight: 600 }}
                          >
                            {headCell.sortable ? (
                              <TableSortLabel
                                active={orderBy === headCell.id}
                                direction={
                                  orderBy === headCell.id ? order : "asc"
                                }
                                onClick={() => handleRequestSort(headCell.id)}
                              >
                                <Typography
                                  variant="caption"
                                  sx={{ fontWeight: 600 }}
                                >
                                  {headCell.label}
                                </Typography>
                              </TableSortLabel>
                            ) : (
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 600 }}
                              >
                                {headCell.label}
                              </Typography>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {clientFilteredData.map((row) => (
                        <TableRow key={row.id} hover>
                          <TableCell sx={{ py: 1.5 }}>
                            <Typography variant="caption" component="div">
                              {new Date(row.ts).toLocaleDateString()}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {new Date(row.ts).toLocaleTimeString()}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Chip label={row.tenant} size="small" />
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Typography
                              variant="caption"
                              sx={{ fontFamily: "monospace" }}
                            >
                              {row.route}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Chip
                              label={row.model}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell sx={{ py: 1.5, maxWidth: 120 }}>
                            {row.sessionId ? (
                              <Tooltip title={row.sessionId}>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontFamily: "monospace",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    display: "block",
                                  }}
                                >
                                  {row.sessionId.slice(0, 8)}...
                                </Typography>
                              </Tooltip>
                            ) : (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                -
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Chip
                              label={row.status}
                              size="small"
                              color={
                                row.status === "success"
                                  ? "success"
                                  : row.status === "blocked"
                                    ? "warning"
                                    : "error"
                              }
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="right" sx={{ py: 1.5 }}>
                            <Typography variant="caption">
                              {row.promptTok.toLocaleString()}
                            </Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ py: 1.5 }}>
                            <Typography variant="caption">
                              {row.compTok.toLocaleString()}
                            </Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ py: 1.5 }}>
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 600 }}
                            >
                              ${parseFloat(row.usd).toFixed(4)}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1.5, maxWidth: 150 }}>
                            <Box
                              sx={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 0.5,
                              }}
                            >
                              {row.tags.length > 0 ? (
                                row.tags
                                  .slice(0, 2)
                                  .map((tag) => (
                                    <Chip
                                      key={tag.id}
                                      label={tag.name}
                                      size="small"
                                      variant="outlined"
                                      color="secondary"
                                      sx={{ fontSize: "0.65rem", height: 20 }}
                                    />
                                  ))
                              ) : (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  -
                                </Typography>
                              )}
                              {row.tags.length > 2 && (
                                <Tooltip
                                  title={row.tags
                                    .slice(2)
                                    .map((tag) => tag.name)
                                    .join(", ")}
                                >
                                  <Chip
                                    label={`+${row.tags.length - 2}`}
                                    size="small"
                                    variant="outlined"
                                    color="secondary"
                                    sx={{ fontSize: "0.65rem", height: 20 }}
                                  />
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <TablePagination
                  rowsPerPageOptions={[10, 25, 50, 100]}
                  component="div"
                  count={totalCount}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </Box>
    </LocalizationProvider>
  );
};

export default UsageTracking;
