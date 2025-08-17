import React from "react";
import { Box, Typography, Card, CardContent, Grid } from "@mui/material";
import SunburstChart from "../charts/SunburstChart";
import TagHierarchyTable from "../charts/TagHierarchyTable";
import EmptyState from "../common/EmptyState";
import type { TagUsageData, TagBudgetHealth } from "../../types";

interface TagUsageBreakdownProps {
  tagUsage: TagUsageData[];
  tagBudgetHealth?: TagBudgetHealth[];
  totalTenantUsage: number;
  title?: string;
  timeRangeLabel?: string;
}

const TagUsageBreakdown: React.FC<TagUsageBreakdownProps> = ({
  tagUsage,
  tagBudgetHealth = [],
  totalTenantUsage,
  title = "Tag Usage Breakdown",
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

        <Grid container spacing={3}>
          {/* Visual Breakdown */}
          <Grid item xs={12} lg={6}>
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                Tag Hierarchy Visualization
              </Typography>
              <SunburstChart
                data={tagUsage}
                title=""
                width={400}
                height={400}
                totalBudgetUsage={totalTenantUsage}
              />
            </Box>
          </Grid>

          {/* Detailed Table */}
          <Grid item xs={12} lg={6}>
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                Usage Details
              </Typography>
              <TagHierarchyTable
                usageData={tagUsage}
                budgetHealth={tagBudgetHealth}
                title=""
              />
            </Box>
          </Grid>
        </Grid>

        {/* Summary Stats */}
        <Box
          sx={{ mt: 3, pt: 2, borderTop: "1px solid", borderColor: "divider" }}
        >
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <Typography variant="body2" color="text.secondary">
                Active Tags
              </Typography>
              <Typography variant="h6">{tagUsage.length}</Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="body2" color="text.secondary">
                Tagged Usage
              </Typography>
              <Typography variant="h6">
                ${tagUsage.reduce((sum, tag) => sum + tag.usage, 0).toFixed(2)}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
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
            </Grid>
          </Grid>
        </Box>
      </CardContent>
    </Card>
  );
};

export default TagUsageBreakdown;
