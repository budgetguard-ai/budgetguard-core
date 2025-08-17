import React, { useState } from "react";
import { Alert, Box, Chip, IconButton, Typography } from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import type { BudgetAlert } from "../../hooks/useBudgetHealth";

interface BudgetAlertBannerProps {
  alerts: BudgetAlert[];
  maxVisible?: number;
  dismissible?: boolean;
}

const BudgetAlertBanner: React.FC<BudgetAlertBannerProps> = ({
  alerts,
  maxVisible = 3,
  dismissible = false,
}) => {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const visibleAlerts = alerts.filter((alert) => !dismissed.has(alert.id));
  const hasMoreAlerts = visibleAlerts.length > maxVisible;
  const displayedAlerts = expanded
    ? visibleAlerts
    : visibleAlerts.slice(0, maxVisible);

  const handleDismiss = (alertId: string) => {
    setDismissed((prev) => new Set([...prev, alertId]));
  };

  const getAlertIcon = (type: BudgetAlert["type"]) => {
    switch (type) {
      case "critical":
        return <ErrorIcon />;
      case "warning":
        return <WarningIcon />;
      case "info":
        return <InfoIcon />;
      default:
        return <InfoIcon />;
    }
  };

  if (visibleAlerts.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mb: 3 }}>
      {displayedAlerts.map((alert) => (
        <Alert
          key={alert.id}
          severity={alert.type === "critical" ? "error" : alert.type}
          icon={getAlertIcon(alert.type)}
          sx={{ mb: 1 }}
          action={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {alert.budget && (
                <Chip
                  label={`${alert.budget.period} budget`}
                  size="small"
                  variant="outlined"
                />
              )}
              {alert.tagBudget && (
                <Chip
                  label={`${alert.tagBudget.period} tag budget`}
                  size="small"
                  variant="outlined"
                />
              )}
              {dismissible && (
                <IconButton
                  size="small"
                  onClick={() => handleDismiss(alert.id)}
                  sx={{ ml: 1 }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          }
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {alert.title}
            </Typography>
            <Typography variant="body2">{alert.message}</Typography>
          </Box>
        </Alert>
      ))}

      {hasMoreAlerts && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            mt: 1,
            cursor: "pointer",
          }}
          onClick={() => setExpanded(!expanded)}
        >
          <Chip
            label={
              expanded
                ? "Show fewer alerts"
                : `Show ${visibleAlerts.length - maxVisible} more alert${visibleAlerts.length - maxVisible === 1 ? "" : "s"}`
            }
            icon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            variant="outlined"
            clickable
          />
        </Box>
      )}
    </Box>
  );
};

export default BudgetAlertBanner;
