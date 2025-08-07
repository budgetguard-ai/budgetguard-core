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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  InputAdornment,
} from "@mui/material";
import {
  Edit as EditIcon,
  Add as AddIcon,
  Download as DownloadIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
} from "@mui/icons-material";
import {
  useModelPricing,
  useCreateModelPricing,
  useUpdateModelPricing,
} from "../hooks/useApi";
import type { ModelPricing } from "../types";

type Order = "asc" | "desc";

interface HeadCell {
  id: keyof ModelPricing;
  label: string;
  numeric: boolean;
  sortable: boolean;
}

const headCells: HeadCell[] = [
  { id: "model", label: "Model", numeric: false, sortable: true },
  { id: "provider", label: "Provider", numeric: false, sortable: true },
  { id: "versionTag", label: "Version", numeric: false, sortable: true },
  { id: "inputPrice", label: "Input Price/1M", numeric: true, sortable: true },
  {
    id: "outputPrice",
    label: "Output Price/1M",
    numeric: true,
    sortable: true,
  },
  { id: "updatedAt", label: "Last Updated", numeric: false, sortable: true },
];

const providerColors: Record<string, "primary" | "secondary" | "success"> = {
  openai: "primary",
  anthropic: "secondary",
  google: "success",
};

const Models: React.FC = () => {
  const { data: models = [], isLoading, error } = useModelPricing();

  const createModelMutation = useCreateModelPricing();
  const updateModelMutation = useUpdateModelPricing();

  // Table state
  const [order, setOrder] = useState<Order>("asc");
  const [orderBy, setOrderBy] = useState<keyof ModelPricing>("model");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Filter state
  const [filters, setFilters] = useState({
    model: "",
    provider: "",
    version: "",
  });

  // Dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelPricing | null>(null);
  const [editForm, setEditForm] = useState({
    model: "",
    versionTag: "",
    inputPrice: "",
    cachedInputPrice: "",
    outputPrice: "",
    provider: "openai" as "openai" | "anthropic" | "google",
  });

  const handleRequestSort = (property: keyof ModelPricing) => {
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

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  };

  const clearFilters = () => {
    setFilters({
      model: "",
      provider: "",
      version: "",
    });
    setPage(0);
  };

  const handleEditModel = (model: ModelPricing) => {
    setEditingModel(model);
    setEditForm({
      model: model.model,
      versionTag: model.versionTag,
      inputPrice: model.inputPrice,
      cachedInputPrice: model.cachedInputPrice,
      outputPrice: model.outputPrice,
      provider: model.provider,
    });
    setEditDialogOpen(true);
  };

  const handleAddModel = () => {
    setEditingModel(null);
    setEditForm({
      model: "",
      versionTag: "",
      inputPrice: "",
      cachedInputPrice: "",
      outputPrice: "",
      provider: "openai",
    });
    setEditDialogOpen(true);
  };

  const handleSaveModel = async () => {
    try {
      const data = {
        model: editForm.model,
        versionTag: editForm.versionTag,
        inputPrice: parseFloat(editForm.inputPrice),
        cachedInputPrice: parseFloat(editForm.cachedInputPrice),
        outputPrice: parseFloat(editForm.outputPrice),
        provider: editForm.provider,
      };

      if (editingModel) {
        await updateModelMutation.mutateAsync({
          idOrModel: editingModel.id,
          data,
        });
      } else {
        await createModelMutation.mutateAsync(data);
      }

      setEditDialogOpen(false);
    } catch (error) {
      console.error("Failed to save model:", error);
    }
  };

  const exportData = () => {
    const csv = [
      [
        "Model",
        "Provider",
        "Version",
        "Input Price",
        "Cached Input Price",
        "Output Price",
      ],
      ...filteredData.map((model) => [
        model.model,
        model.provider,
        model.versionTag,
        model.inputPrice,
        model.cachedInputPrice,
        model.outputPrice,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `model-pricing-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = models;

    // Apply filters
    if (filters.model) {
      data = data.filter((model) =>
        model.model.toLowerCase().includes(filters.model.toLowerCase()),
      );
    }

    if (filters.provider) {
      data = data.filter((model) => model.provider === filters.provider);
    }

    if (filters.version) {
      data = data.filter((model) =>
        model.versionTag.toLowerCase().includes(filters.version.toLowerCase()),
      );
    }

    // Sort data
    return data.sort((a, b) => {
      let aVal = a[orderBy];
      let bVal = b[orderBy];

      // Handle different data types
      if (orderBy === "updatedAt" || orderBy === "createdAt") {
        aVal = new Date(a[orderBy]).getTime();
        bVal = new Date(b[orderBy]).getTime();
      } else if (
        orderBy === "inputPrice" ||
        orderBy === "outputPrice" ||
        orderBy === "cachedInputPrice"
      ) {
        aVal = parseFloat(a[orderBy]);
        bVal = parseFloat(b[orderBy]);
      } else if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }

      if (order === "asc") {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });
  }, [models, filters, order, orderBy]);

  const paginatedData = filteredData.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  const activeFiltersCount = Object.values(filters).filter(
    (value) => value !== "",
  ).length;

  const uniqueProviders = Array.from(new Set(models.map((m) => m.provider)));

  if (isLoading) {
    return (
      <Box>
        <Typography
          variant="h5"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, mb: 4 }}
        >
          Model Pricing
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography
          variant="h5"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, mb: 4 }}
        >
          Model Pricing
        </Typography>
        <Alert severity="error">Failed to load models: {error.message}</Alert>
      </Box>
    );
  }

  return (
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
          Model Pricing
        </Typography>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={exportData}
            disabled={filteredData.length === 0}
          >
            Export CSV
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddModel}
          >
            Add Model
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
            <SearchIcon />
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
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 2,
            }}
          >
            <TextField
              label="Model Name"
              value={filters.model}
              onChange={(e) => handleFilterChange("model", e.target.value)}
              size="small"
              placeholder="Search models..."
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />

            <FormControl size="small">
              <InputLabel>Provider</InputLabel>
              <Select
                value={filters.provider}
                label="Provider"
                onChange={(e) => handleFilterChange("provider", e.target.value)}
              >
                <MenuItem value="">All Providers</MenuItem>
                {uniqueProviders.map((provider) => (
                  <MenuItem key={provider} value={provider}>
                    {provider.charAt(0).toUpperCase() + provider.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Version"
              value={filters.version}
              onChange={(e) => handleFilterChange("version", e.target.value)}
              size="small"
              placeholder="Search versions..."
            />
          </Box>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          {filteredData.length === 0 ? (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Alert severity="info">
                No models found matching your filters.
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
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedData.map((model) => (
                      <TableRow key={model.id} hover>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: "monospace" }}
                          >
                            {model.model}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={
                              model.provider.charAt(0).toUpperCase() +
                              model.provider.slice(1)
                            }
                            size="small"
                            color={providerColors[model.provider] || "default"}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {model.versionTag}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            ${parseFloat(model.inputPrice).toFixed(4)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            ${parseFloat(model.outputPrice).toFixed(4)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {new Date(model.updatedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit Model">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleEditModel(model)}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <TablePagination
                rowsPerPageOptions={[10, 25, 50, 100]}
                component="div"
                count={filteredData.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit/Add Model Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingModel ? "Edit Model" : "Add New Model"}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Model Name"
                value={editForm.model}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, model: e.target.value }))
                }
                fullWidth
                placeholder="e.g., gpt-4-turbo"
              />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Provider</InputLabel>
                <Select
                  value={editForm.provider}
                  label="Provider"
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      provider: e.target.value as
                        | "openai"
                        | "anthropic"
                        | "google",
                    }))
                  }
                >
                  <MenuItem value="openai">OpenAI</MenuItem>
                  <MenuItem value="anthropic">Anthropic</MenuItem>
                  <MenuItem value="google">Google</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Version Tag"
                value={editForm.versionTag}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    versionTag: e.target.value,
                  }))
                }
                fullWidth
                placeholder="e.g., v1.0"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Input Price per 1M tokens"
                type="number"
                value={editForm.inputPrice}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    inputPrice: e.target.value,
                  }))
                }
                fullWidth
                inputProps={{ step: 0.001, min: 0 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Output Price per 1M tokens"
                type="number"
                value={editForm.outputPrice}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    outputPrice: e.target.value,
                  }))
                }
                fullWidth
                inputProps={{ step: 0.001, min: 0 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Cached Input Price per 1M tokens"
                type="number"
                value={editForm.cachedInputPrice}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    cachedInputPrice: e.target.value,
                  }))
                }
                fullWidth
                inputProps={{ step: 0.001, min: 0 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                }}
                helperText="Price for cached input tokens (usually lower than regular input price)"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveModel}
            variant="contained"
            disabled={
              !editForm.model ||
              !editForm.versionTag ||
              !editForm.inputPrice ||
              !editForm.outputPrice ||
              !editForm.cachedInputPrice ||
              createModelMutation.isPending ||
              updateModelMutation.isPending
            }
          >
            {createModelMutation.isPending || updateModelMutation.isPending
              ? "Saving..."
              : editingModel
                ? "Update"
                : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Models;
