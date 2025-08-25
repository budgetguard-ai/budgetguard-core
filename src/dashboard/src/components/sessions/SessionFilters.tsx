import React from "react";
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  InputAdornment,
} from "@mui/material";
import { Search as SearchIcon } from "@mui/icons-material";
import type { SessionFilters as SessionFiltersType } from "../../types";

interface SessionFiltersProps {
  filters: SessionFiltersType;
  onFiltersChange: (filters: SessionFiltersType) => void;
}

const SessionFilters: React.FC<SessionFiltersProps> = ({
  filters,
  onFiltersChange,
}) => {
  const handleFilterChange = (
    key: keyof SessionFiltersType,
    value: string | number,
  ) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined, // Convert empty strings to undefined
      page: 1, // Reset to first page when filters change
    });
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Grid container spacing={2} alignItems="center">
        {/* Search Field */}
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            fullWidth
            size="small"
            label="Search Sessions"
            placeholder="Search by session ID or name"
            value={filters.search || ""}
            onChange={(e) => handleFilterChange("search", e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </Grid>

        {/* Status Filter */}
        <Grid item xs={12} sm={6} md={2}>
          <FormControl fullWidth size="small">
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.status || ""}
              label="Status"
              onChange={(e) => handleFilterChange("status", e.target.value)}
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="budget_exceeded">Budget Exceeded</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="error">Error</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        {/* Start Date */}
        <Grid item xs={12} sm={6} md={3}>
          <TextField
            fullWidth
            size="small"
            label="Start Date"
            type="date"
            value={filters.startDate || ""}
            onChange={(e) => handleFilterChange("startDate", e.target.value)}
            InputLabelProps={{
              shrink: true,
            }}
          />
        </Grid>

        {/* End Date */}
        <Grid item xs={12} sm={6} md={3}>
          <TextField
            fullWidth
            size="small"
            label="End Date"
            type="date"
            value={filters.endDate || ""}
            onChange={(e) => handleFilterChange("endDate", e.target.value)}
            InputLabelProps={{
              shrink: true,
            }}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default SessionFilters;
