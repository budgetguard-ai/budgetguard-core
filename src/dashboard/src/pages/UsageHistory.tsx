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
  { id: "promptTok", label: "Input Tokens", numeric: true, sortable: true },
  { id: "compTok", label: "Output Tokens", numeric: true, sortable: true },
  { id: "usd", label: "Cost (USD)", numeric: true, sortable: true },
  // Do not add any id here that does not exist on UsageLedger
];

const UsageHistory: React.FC = () => {
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
        "Input Tokens",
        "Output Tokens",
        "Cost (USD)",
      ],
      ...data.map((row) => [
        new Date(row.ts).toLocaleDateString(),
        new Date(row.ts).toLocaleTimeString(),
        row.tenant,
        row.route,
        row.model,
        row.promptTok.toString(),
        row.compTok.toString(),
        `$${parseFloat(row.usd)}`,
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
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
            Usage History
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
              <Typography variant="h6">Filters</Typography>
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
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 2,
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
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        {headCells.map((headCell) => (
                          <TableCell
                            key={headCell.id}
                            align={headCell.numeric ? "right" : "left"}
                            sortDirection={
                              orderBy === headCell.id ? order : false
                            }
                          >
                            {headCell.sortable ? (
                              <TableSortLabel
                                active={orderBy === headCell.id}
                                direction={
                                  orderBy === headCell.id ? order : "asc"
                                }
                                onClick={() => handleRequestSort(headCell.id)}
                              >
                                {headCell.label}
                              </TableSortLabel>
                            ) : (
                              headCell.label
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {clientFilteredData.map((row) => (
                        <TableRow key={row.id} hover>
                          <TableCell>
                            {new Date(row.ts).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Chip label={row.tenant} size="small" />
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{ fontFamily: "monospace" }}
                            >
                              {row.route}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={row.model}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="right">
                            {row.promptTok.toLocaleString()}
                          </TableCell>
                          <TableCell align="right">
                            {row.compTok.toLocaleString()}
                          </TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600 }}
                            >
                              ${parseFloat(row.usd)}
                            </Typography>
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

export default UsageHistory;
