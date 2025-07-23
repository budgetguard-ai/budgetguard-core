import React from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Alert,
  Grid,
  Chip,
  Skeleton,
} from "@mui/material";
import { useTenants } from "../hooks/useApi";

const Tenants: React.FC = () => {
  const { data: tenants, isLoading, error } = useTenants();

  // Debug: log tenant data to see what we're getting
  React.useEffect(() => {
    if (tenants) {
      console.log("Tenant data:", tenants);
    }
  }, [tenants]);

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
    <Box sx={{ width: "100%", maxWidth: "100%" }}>
      <Typography
        variant="h4"
        component="h1"
        gutterBottom
        sx={{ fontWeight: 600, mb: 4 }}
      >
        Tenant Management
      </Typography>

      <Grid container spacing={3}>
        {tenants?.map((tenant) => (
          <Grid item xs={12} md={6} lg={6} key={tenant.id}>
            <Card>
              <CardContent>
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
            </Card>
          </Grid>
        ))}
      </Grid>

      {tenants?.length === 0 && (
        <Box textAlign="center" py={4}>
          <Typography variant="h6" color="text.secondary">
            No tenants found
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default Tenants;
