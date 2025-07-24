import React, { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Alert,
  Grid,
  Chip,
  Skeleton,
  Button,
  CardActions,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
} from "@mui/icons-material";
import { useTenants } from "../hooks/useApi";
import {
  CreateTenantDialog,
  EditTenantDialog,
  DeleteConfirmationDialog,
} from "../components/dialogs";
import type { Tenant } from "../types";

const Tenants: React.FC = () => {
  const { data: tenants, isLoading, error } = useTenants();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  const handleEditTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setEditDialogOpen(true);
  };

  const handleDeleteTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setDeleteDialogOpen(true);
  };

  const handleCloseDialogs = () => {
    setCreateDialogOpen(false);
    setEditDialogOpen(false);
    setDeleteDialogOpen(false);
    setSelectedTenant(null);
  };

  // Skeleton loading component
  const TenantCardSkeleton = () => (
    <Card sx={{ width: "100%", boxSizing: "border-box" }}>
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Skeleton variant="text" width="60%" height={32} sx={{ mb: 2 }} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
          >
            <Skeleton variant="text" width={30} height={20} />
            <Skeleton
              variant="rectangular"
              width={40}
              height={24}
              sx={{ borderRadius: 12 }}
            />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <Box sx={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
        <Typography
          variant="h4"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, mb: 4 }}
        >
          Tenant Management
        </Typography>
        <Grid container spacing={3} sx={{ width: "100%", margin: 0 }}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Grid item xs={12} sm={6} md={4} xl={3} key={index}>
              <TenantCardSkeleton />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">Failed to load tenants: {error.message}</Alert>
    );
  }

  return (
    <Box sx={{ width: "100%", maxWidth: "100%", position: "relative" }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 4,
        }}
      >
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Tenant Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
          sx={{ minWidth: 140 }}
        >
          Create Tenant
        </Button>
      </Box>

      <Grid container spacing={3}>
        {tenants?.map((tenant) => (
          <Grid item xs={12} md={6} lg={6} key={tenant.id}>
            <Card
              sx={{ height: "100%", display: "flex", flexDirection: "column" }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                  {tenant.name}
                </Typography>
                <Box display="flex" alignItems="center" mb={1}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mr: 1 }}
                  >
                    ID:
                  </Typography>
                  <Chip
                    label={tenant.id}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </Box>
                {tenant.createdAt && (
                  <Box display="flex" alignItems="center" mb={1}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mr: 1 }}
                    >
                      Created:
                    </Typography>
                    <Typography variant="body2" color="text.primary">
                      {(() => {
                        try {
                          const date = new Date(tenant.createdAt);
                          if (isNaN(date.getTime())) return "Unknown";
                          return date.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          });
                        } catch {
                          return "Unknown";
                        }
                      })()}
                    </Typography>
                  </Box>
                )}
                {tenant.updatedAt && (
                  <Box display="flex" alignItems="center" mb={1}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mr: 1 }}
                    >
                      Updated:
                    </Typography>
                    <Typography variant="body2" color="text.primary">
                      {(() => {
                        try {
                          const date = new Date(tenant.updatedAt);
                          if (isNaN(date.getTime())) return "Unknown";
                          return date.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          });
                        } catch {
                          return "Unknown";
                        }
                      })()}
                    </Typography>
                  </Box>
                )}
                {tenant.rateLimitPerMin !== null &&
                  tenant.rateLimitPerMin !== undefined && (
                    <Box display="flex" alignItems="center">
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mr: 1 }}
                      >
                        Rate Limit:
                      </Typography>
                      <Chip
                        label={`${tenant.rateLimitPerMin}/min`}
                        size="small"
                        color="secondary"
                        variant="outlined"
                      />
                    </Box>
                  )}
              </CardContent>
              <CardActions
                sx={{ justifyContent: "space-between", p: 2, pt: 0 }}
              >
                <Box>
                  <Tooltip title="View Details">
                    <IconButton size="small" color="primary">
                      <InfoIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box>
                  <Tooltip title="Edit Tenant">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => handleEditTenant(tenant)}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete Tenant">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteTenant(tenant)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {tenants?.length === 0 && (
        <Box textAlign="center" py={8}>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
            No tenants found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create your first tenant to get started
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Tenant
          </Button>
        </Box>
      )}

      {/* Dialogs */}
      <CreateTenantDialog
        open={createDialogOpen}
        onClose={handleCloseDialogs}
      />

      <EditTenantDialog
        open={editDialogOpen}
        tenant={selectedTenant}
        onClose={handleCloseDialogs}
      />

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        tenant={selectedTenant}
        onClose={handleCloseDialogs}
      />
    </Box>
  );
};

export default Tenants;
