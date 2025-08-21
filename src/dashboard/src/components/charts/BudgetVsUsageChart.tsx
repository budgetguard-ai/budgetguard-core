import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  BarController,
  LineController,
  TooltipItem,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { Box, Typography, Card, CardContent, useTheme } from "@mui/material";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  BarController,
  LineController,
);

interface BudgetVsUsageData {
  labels: string[];
  usage: number[];
  budgets: number[];
}

interface BudgetVsUsageChartProps {
  data: BudgetVsUsageData;
  title?: string;
  height?: number;
}

const BudgetVsUsageChart: React.FC<BudgetVsUsageChartProps> = ({
  data,
  title = "Budget vs Usage",
  height = 400,
}) => {
  const theme = useTheme();
  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: "Budget",
        data: data.budgets,
        backgroundColor: "rgba(54, 162, 235, 0.5)",
        borderColor: "rgba(54, 162, 235, 1)",
        borderWidth: 2,
      },
      {
        label: "Usage",
        data: data.usage,
        backgroundColor: data.usage.map((usage, index) =>
          usage > data.budgets[index]
            ? "rgba(255, 99, 132, 0.7)"
            : "rgba(75, 192, 192, 0.7)",
        ),
        borderColor: data.usage.map((usage, index) =>
          usage > data.budgets[index]
            ? "rgba(255, 99, 132, 1)"
            : "rgba(75, 192, 192, 1)",
        ),
        borderWidth: 2,
      },
    ],
  };

  const textColor = theme.palette.mode === "dark" ? "#FFFFFF" : "#000000";
  const gridColor =
    theme.palette.mode === "dark"
      ? "rgba(255, 255, 255, 0.1)"
      : "rgba(0, 0, 0, 0.1)";

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 10,
        right: 10,
        bottom: 10,
        left: 10,
      },
    },
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          color: textColor,
        },
      },
      tooltip: {
        callbacks: {
          label: function (context: TooltipItem<"bar">) {
            const label = context.dataset.label || "";
            const value = context.parsed.y;
            return `${label}: $${value.toFixed(2)}`;
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: "Time Period",
          color: textColor,
        },
        ticks: {
          color: textColor,
        },
        grid: {
          color: gridColor,
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: "Amount (USD)",
          color: textColor,
        },
        ticks: {
          color: textColor,
          callback: function (value: string | number) {
            return `$${value}`;
          },
        },
        grid: {
          color: gridColor,
        },
      },
    },
  };

  return (
    <Card>
      <CardContent sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          {title}
        </Typography>
        <Box sx={{ height: height }}>
          <Bar data={chartData} options={options} />
        </Box>
      </CardContent>
    </Card>
  );
};

export default BudgetVsUsageChart;
