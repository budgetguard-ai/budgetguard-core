import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { Box, Typography, Card, CardContent } from "@mui/material";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

interface UsageTrendData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color: string;
  }>;
}

interface UsageTrendChartProps {
  data: UsageTrendData;
  title?: string;
  height?: number;
}

const UsageTrendChart: React.FC<UsageTrendChartProps> = ({
  data,
  title = "Usage Trends",
  height = 400,
}) => {
  const chartData = {
    labels: data.labels,
    datasets: data.datasets.map((dataset) => ({
      label: dataset.label,
      data: dataset.data,
      borderColor: dataset.color,
      backgroundColor: dataset.color + "20",
      borderWidth: 2,
      fill: false,
      tension: 0.1,
      pointRadius: 4,
      pointHoverRadius: 6,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
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
          text: "Date",
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: "Usage (USD)",
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
          <Line data={chartData} options={options} />
        </Box>
      </CardContent>
    </Card>
  );
};

export default UsageTrendChart;
