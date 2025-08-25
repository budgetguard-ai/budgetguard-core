import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
} from "@mui/material";
import SessionsTable from "../components/sessions/SessionsTable";
import SessionFilters from "../components/sessions/SessionFilters";
import { useSessions } from "../hooks/useApi";
import { useDashboardStore } from "../hooks/useStore";
import { useTenants } from "../hooks/useApi";
import type { SessionFilters as SessionFiltersType } from "../types";

const Sessions: React.FC = () => {
  const { selectedTenant, setSelectedTenant } = useDashboardStore();
  const { data: tenants = [], isLoading: tenantsLoading } = useTenants();

  const [filters, setFilters] = useState<SessionFiltersType>({
    page: 1,
    limit: 10,
  });

  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useSessions(selectedTenant?.id || 0, filters);

  // Auto-select first tenant if none is selected and tenants are available
  useEffect(() => {
    if (!selectedTenant && tenants.length > 0 && !tenantsLoading) {
      setSelectedTenant(tenants[0]);
    }
  }, [tenants, selectedTenant, setSelectedTenant, tenantsLoading]);

  const handlePageChange = (page: number) => {
    setFilters({ ...filters, page });
  };

  const handleLimitChange = (limit: number) => {
    setFilters({ ...filters, limit, page: 1 });
  };

  if (tenantsLoading) {
    return (
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mb: 4 }}>
          Sessions
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (tenants.length === 0) {
    return (
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mb: 4 }}>
          Sessions
        </Typography>
        <Alert severity="info">
          No tenants found. Please create a tenant first to view sessions.
        </Alert>
      </Box>
    );
  }

  const sessions = sessionsData?.sessions || [];
  const pagination = sessionsData?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          Sessions
        </Typography>

        {/* Tenant Selector */}
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Select Tenant</InputLabel>
          <Select
            value={selectedTenant?.id || ""}
            label="Select Tenant"
            onChange={(e) => {
              const tenant = tenants.find(
                (t) => t.id === Number(e.target.value),
              );
              setSelectedTenant(tenant || null);
            }}
          >
            {tenants.map((tenant) => (
              <MenuItem key={tenant.id} value={tenant.id}>
                {tenant.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {selectedTenant && (
        <>
          {/* Filters */}
          <SessionFilters filters={filters} onFiltersChange={setFilters} />

          {/* Error State */}
          {sessionsError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to load sessions. Please try again.
            </Alert>
          )}

          {/* Loading State */}
          {sessionsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            /* Sessions Table */
            <SessionsTable
              sessions={sessions}
              total={pagination.total}
              page={pagination.page}
              limit={pagination.limit}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
            />
          )}
        </>
      )}
    </Box>
  );
};

export default Sessions;
