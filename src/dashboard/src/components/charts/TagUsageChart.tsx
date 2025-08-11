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
import { formatCurrency } from "../../utils/currency";
import type { TagUsageData } from "../../types";

ChartJS.register(ArcElement, Tooltip, Legend);

interface TagUsageChartProps {
  data: TagUsageData[];
  title?: string;
  height?: number;
  showLegend?: boolean;
  onTagClick?: (tag: TagUsageData) => void;
  showRootOnly?: boolean;
}

// Generate consistent colors for tags
const generateTagColors = (count: number): string[] => {
  const colors = [
    "#FF6384",
    "#36A2EB",
    "#FFCE56",
    "#4BC0C0",
    "#9966FF",
    "#FF9F40",
    "#FF6384",
    "#C9CBCF",
    "#4BC0C0",
    "#FF6384",
    "#36A2EB",
    "#FFCE56",
    "#4BC0C0",
    "#9966FF",
    "#FF9F40",
  ];

  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(colors[i % colors.length]);
  }
  return result;
};

const TagUsageChart: React.FC<TagUsageChartProps> = ({
  data,
  title = "Tag Usage Distribution",
  height = 300,
  showLegend = true,
  onTagClick,
  showRootOnly = false,
}) => {
  // Filter for root tags only if requested
  let filteredData = data;
  if (showRootOnly) {
    filteredData = data.filter((tag) => !tag.path.includes("/"));
  }

  // Sort data by usage descending and take top 10 for readability
  const sortedData = filteredData
    .sort((a, b) => b.usage - a.usage)
    .slice(0, 10);

  const colors = generateTagColors(sortedData.length);

  // Update data with colors
  const chartData = sortedData.map((tag, index) => ({
    ...tag,
    color: tag.color || colors[index],
  }));

  const chartJsData = {
    labels: chartData.map((tag) => tag.tagName),
    datasets: [
      {
        label: "Usage",
        data: chartData.map((tag) => tag.usage),
        backgroundColor: chartData.map((tag) => tag.color),
        borderColor: chartData.map((tag) => tag.color),
        borderWidth: 1,
        hoverBorderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event: unknown, elements: { index: number }[]) => {
      if (elements.length > 0 && onTagClick) {
        const clickedIndex = elements[0].index;
        const clickedTag = chartData[clickedIndex];
        onTagClick(clickedTag);
      }
    },
    plugins: {
      legend: {
        display: showLegend,
        position: "right" as const,
        labels: {
          usePointStyle: true,
          padding: 15,
          font: {
            size: 11,
          },
          generateLabels: (chart: ChartJS) => {
            const original =
              ChartJS.defaults.plugins.legend.labels.generateLabels;
            const labels = original(chart);
            return labels.map((label, index) => {
              const tag = chartData[index];
              return {
                ...label,
                text: `${tag.tagName} (${tag.percentage.toFixed(1)}%)`,
              };
            });
          },
        },
        onClick: (_event: unknown, legendItem: { index?: number }) => {
          if (onTagClick && legendItem.index !== undefined) {
            const clickedTag = chartData[legendItem.index];
            onTagClick(clickedTag);
          }
        },
      },
      tooltip: {
        callbacks: {
          label: function (context: TooltipItem<"doughnut">) {
            const tag = chartData[context.dataIndex];
            return [
              `${tag.tagName}: ${formatCurrency(tag.usage)}`,
              `Requests: ${tag.requests.toLocaleString()}`,
              `Share: ${tag.percentage.toFixed(1)}%`,
              ...(onTagClick ? ["Click to drill down"] : []),
            ];
          },
        },
      },
    },
    cutout: "60%", // Make it a doughnut chart
  };

  const totalUsage = chartData.reduce((sum, tag) => sum + tag.usage, 0);
  const totalRequests = chartData.reduce((sum, tag) => sum + tag.requests, 0);

  return (
    <Card>
      <CardContent sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          {title}
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={showLegend ? 8 : 12}>
            <Box sx={{ height, position: "relative" }}>
              <Doughnut data={chartJsData} options={options} />

              {/* Center content */}
              <Box
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: showLegend ? "25%" : "50%",
                  transform: "translate(-50%, -50%)",
                  textAlign: "center",
                  pointerEvents: "none",
                }}
              >
                <Typography variant="h6" fontWeight={600}>
                  {formatCurrency(totalUsage)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total Usage
                </Typography>
                <br />
                <Typography variant="body2">
                  {totalRequests.toLocaleString()}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Requests
                </Typography>
              </Box>
            </Box>
          </Grid>

          {showLegend && (
            <Grid item xs={12} md={4}>
              <Box sx={{ pl: 2 }}>
                <Typography variant="body2" fontWeight={500} gutterBottom>
                  Top Tags
                </Typography>
                {chartData.slice(0, 5).map((tag) => (
                  <Box
                    key={tag.tagId}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      py: 0.5,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: tag.color,
                        }}
                      />
                      <Typography variant="body2" noWrap>
                        {tag.tagName}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {tag.percentage.toFixed(1)}%
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  );
};

export default TagUsageChart;
