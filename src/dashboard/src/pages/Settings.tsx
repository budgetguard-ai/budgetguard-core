import React from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  CircularProgress,
  Alert,
} from "@mui/material";
import {
  Storage as DatabaseIcon,
  Psychology as ProvidersIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { useHealth } from "../hooks/useApi";

const Settings: React.FC = () => {
  const {
    data: health,
    isLoading: healthLoading,
    error: healthError,
  } = useHealth();

  return (
    <Box>
      <Typography
        variant="h4"
        component="h1"
        gutterBottom
        sx={{ fontWeight: 600, mb: 4 }}
      >
        Settings
      </Typography>

      {/* System Health Section */}
      <Typography variant="h5" gutterBottom sx={{ mt: 4, mb: 3 }}>
        System Health
      </Typography>

      {healthLoading ? (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          minHeight="200px"
        >
          <CircularProgress />
        </Box>
      ) : healthError ? (
        <Alert severity="error">
          Failed to load system health: {healthError.message}
        </Alert>
      ) : (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* System Health Card */}
          <Grid item xs={12} md={6} lg={4}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <DatabaseIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">System Status</Typography>
                </Box>
                <Box display="flex" alignItems="center" mb={1}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mr: 1 }}
                  >
                    Overall:
                  </Typography>
                  <Chip
                    label={health?.ok ? "Healthy" : "Issues Detected"}
                    color={health?.ok ? "success" : "error"}
                    size="small"
                  />
                </Box>
                <Box display="flex" alignItems="center" mb={1}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mr: 1 }}
                  >
                    Database:
                  </Typography>
                  <Chip
                    label={
                      health?.dependencies.database
                        ? "Connected"
                        : "Disconnected"
                    }
                    color={health?.dependencies.database ? "success" : "error"}
                    size="small"
                  />
                </Box>
                <Box display="flex" alignItems="center">
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mr: 1 }}
                  >
                    Redis:
                  </Typography>
                  <Chip
                    label={
                      health?.dependencies.redis ? "Connected" : "Disconnected"
                    }
                    color={health?.dependencies.redis ? "success" : "error"}
                    size="small"
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Providers Status Card */}
          <Grid item xs={12} md={6} lg={4}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <ProvidersIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">AI Providers</Typography>
                </Box>
                <Box display="flex" alignItems="center" mb={2}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mr: 1 }}
                  >
                    Configured:
                  </Typography>
                  <Chip
                    label={health?.dependencies.providers.configured || 0}
                    color="info"
                    size="small"
                  />
                </Box>
                {(health?.dependencies.providers.configured || 0) > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {(health?.dependencies.providers.configured || 0) === 1
                      ? "Provider"
                      : "Providers"}{" "}
                    available based on configuration
                  </Typography>
                )}
                {(health?.dependencies.providers.configured || 0) === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Configure API keys to enable providers
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Provider Configuration Info */}
          <Grid item xs={12} md={6} lg={4}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <SettingsIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Configuration</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Supported AI providers: OpenAI, Anthropic Claude, and Google
                  Gemini
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Configure provider API keys via environment variables or
                  request headers in the API
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Application Settings Section */}
      <Typography variant="h5" gutterBottom sx={{ mt: 4, mb: 3 }}>
        Application Settings
      </Typography>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Coming Soon
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Additional application settings and configuration options will be
            available here in future updates.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Settings;
