import React from "react";
import { Alert, Button, Box } from "@mui/material";
import { RefreshRounded as RefreshIcon } from "@mui/icons-material";

interface ErrorAlertProps {
  error: string | Error;
  onRetry?: () => void;
  severity?: "error" | "warning" | "info";
  showRetry?: boolean;
}

const ErrorAlert: React.FC<ErrorAlertProps> = ({
  error,
  onRetry,
  severity = "error",
  showRetry = true,
}) => {
  const errorMessage = error instanceof Error ? error.message : error;

  return (
    <Alert
      severity={severity}
      sx={{ mb: 3 }}
      action={
        showRetry && onRetry ? (
          <Button
            color="inherit"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={onRetry}
          >
            Retry
          </Button>
        ) : null
      }
    >
      <Box>
        <strong>Failed to load data</strong>
        <br />
        {errorMessage}
      </Box>
    </Alert>
  );
};

export default ErrorAlert;
