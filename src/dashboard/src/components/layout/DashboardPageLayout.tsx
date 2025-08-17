import React from "react";
import { Box, Typography } from "@mui/material";

interface DashboardPageLayoutProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

const DashboardPageLayout: React.FC<DashboardPageLayoutProps> = ({
  title,
  subtitle,
  actions,
  children,
}) => {
  return (
    <Box>
      {/* Page Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>

        {actions && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            {actions}
          </Box>
        )}
      </Box>

      {/* Page Content */}
      <Box>{children}</Box>
    </Box>
  );
};

export default DashboardPageLayout;
