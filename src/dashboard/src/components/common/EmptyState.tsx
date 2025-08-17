import React from "react";
import { Box, Typography, Card, CardContent } from "@mui/material";
import { InfoOutlined as InfoIcon } from "@mui/icons-material";

interface EmptyStateProps {
  title?: string;
  message: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  icon,
  action,
}) => {
  return (
    <Card>
      <CardContent>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            py: 4,
            px: 2,
          }}
        >
          <Box sx={{ color: "text.secondary", mb: 2 }}>
            {icon || <InfoIcon sx={{ fontSize: 48 }} />}
          </Box>

          {title && (
            <Typography variant="h6" gutterBottom>
              {title}
            </Typography>
          )}

          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {message}
          </Typography>

          {action && <Box sx={{ mt: 1 }}>{action}</Box>}
        </Box>
      </CardContent>
    </Card>
  );
};

export default EmptyState;
