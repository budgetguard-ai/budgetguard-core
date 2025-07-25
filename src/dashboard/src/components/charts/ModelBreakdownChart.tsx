import React from "react";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  TooltipItem,
} from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { Box, Typography, Card, CardContent, Grid } from "@mui/material";

ChartJS.register(ArcElement, Tooltip, Legend);

interface ModelUsageData {
  model: string;
  usage: number;
  percentage: number;
  color: string;
}

interface ModelBreakdownChartProps {
  data: ModelUsageData[];
  title?: string;
  height?: number;
}

const ModelBreakdownChart: React.FC<ModelBreakdownChartProps> = ({
  data,
  title = "Usage by Model",
  height = 400,
}) => {
  const chartData = {
    labels: data.map((item) => item.model),
    datasets: [
      {
        data: data.map((item) => item.usage),
        backgroundColor: data.map((item) => item.color),
        borderColor: data.map((item) => item.color),
        borderWidth: 2,
        hoverBorderWidth: 3,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false, // Disable built-in legend to avoid duplication
      },
      tooltip: {
        callbacks: {
          label: function (context: TooltipItem<"doughnut">) {
            const label = context.label || "";
            const value = context.parsed;
            const percentage = data[context.dataIndex]?.percentage || 0;
            return `${label}: $${value.toFixed(2)} (${percentage.toFixed(1)}%)`;
          },
        },
      },
    },
    cutout: "60%",
  };

  const totalUsage = data.reduce((sum, item) => sum + item.usage, 0);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <Box sx={{ height: height, position: "relative" }}>
              <Doughnut data={chartData} options={options} />
              <Box
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  textAlign: "center",
                }}
              >
                <Typography
                  variant={height < 300 ? "h6" : height < 400 ? "h5" : "h4"}
                  color="primary"
                  sx={{ fontSize: { xs: "1.2rem", sm: "1.5rem", md: "2rem" } }}
                >
                  ${totalUsage.toFixed(2)}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Total Usage
                </Typography>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box sx={{ mt: 2 }}>
              {data.map((item, index) => (
                <Box
                  key={index}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mb: 1,
                    p: 1,
                    borderRadius: 1,
                    bgcolor: "background.paper",
                  }}
                >
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      bgcolor: item.color,
                      borderRadius: "50%",
                      mr: 1,
                    }}
                  />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2" fontWeight="medium">
                      {item.model}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ${item.usage.toFixed(2)} ({item.percentage.toFixed(1)}%)
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

export default ModelBreakdownChart;
