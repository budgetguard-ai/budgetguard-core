import React from "react";
import { Box, Typography, Card, CardContent } from "@mui/material";
import SunburstChart from "../charts/SunburstChart";
import EmptyState from "../common/EmptyState";
import type { TagUsageData } from "../../types";

interface TagHierarchyVisualizationProps {
  tagUsage: TagUsageData[];
  totalTenantUsage: number;
  title?: string;
  timeRangeLabel?: string;
}

const TagHierarchyVisualization: React.FC<TagHierarchyVisualizationProps> = ({
  tagUsage,
  totalTenantUsage,
  title = "Tag Hierarchy Visualization",
  timeRangeLabel,
}) => {
  if (tagUsage.length === 0) {
    return (
      <Card>
        <CardContent>
          {title && (
            <Typography variant="h6" gutterBottom>
              {title}
              {timeRangeLabel && (
                <Typography
                  component="span"
                  variant="body2"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  ({timeRangeLabel})
                </Typography>
              )}
            </Typography>
          )}
          <EmptyState
            title="No Tag Usage Data"
            message="No tag usage data is available for the selected time period. Tags will appear here once API requests with tag headers are made."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        {title && (
          <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
            {title}
            {timeRangeLabel && (
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
                sx={{ ml: 1 }}
              >
                ({timeRangeLabel})
              </Typography>
            )}
          </Typography>
        )}

        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <SunburstChart
            data={tagUsage}
            title=""
            width={600}
            height={500}
            totalBudgetUsage={totalTenantUsage}
          />
        </Box>

        {/* Summary Stats */}
        <Box
          sx={{ mt: 3, pt: 2, borderTop: "1px solid", borderColor: "divider" }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-around",
              textAlign: "center",
            }}
          >
            <Box>
              <Typography variant="body2" color="text.secondary">
                Active Tags
              </Typography>
              <Typography variant="h6">{tagUsage.length}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Tagged Usage
              </Typography>
              <Typography variant="h6">
                ${tagUsage.reduce((sum, tag) => sum + tag.usage, 0).toFixed(2)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Coverage
              </Typography>
              <Typography variant="h6">
                {totalTenantUsage > 0
                  ? (
                      (tagUsage.reduce((sum, tag) => sum + tag.usage, 0) /
                        totalTenantUsage) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default TagHierarchyVisualization;
