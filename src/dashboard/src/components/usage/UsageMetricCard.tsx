import React from "react";
import { Card, CardContent, Box, Typography } from "@mui/material";

interface UsageMetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactElement;
  color?: "primary" | "success" | "warning" | "error" | "info";
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

const UsageMetricCard: React.FC<UsageMetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color = "primary",
  trend,
}) => {
  return (
    <Card>
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ color: `${color}.main` }}>
            {React.cloneElement(icon, { sx: { fontSize: 32 } })}
          </Box>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h5" color={`${color}.main`} noWrap>
              {typeof value === "number" ? value.toLocaleString() : value}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {subtitle}
              </Typography>
            )}
            {trend && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  mt: 0.5,
                }}
              >
                <Typography
                  variant="caption"
                  color={trend.isPositive ? "success.main" : "error.main"}
                >
                  {trend.isPositive ? "↗" : "↘"} {trend.isPositive ? "+" : ""}
                  {trend.value.toFixed(1)}%
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default UsageMetricCard;
