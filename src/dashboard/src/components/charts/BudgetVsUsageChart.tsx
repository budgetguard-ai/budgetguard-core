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
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { Box, Typography, Card, CardContent } from "@mui/material";

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

  const options = {
    responsive: true,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: "top" as const,
      },
      tooltip: {
        callbacks: {
          label: function (context: {
            dataset: { label?: string };
            parsed: { y: number };
          }) {
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
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: "Amount (USD)",
        },
        ticks: {
          callback: function (value: string | number) {
            return `$${value}`;
          },
        },
      },
    },
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
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
