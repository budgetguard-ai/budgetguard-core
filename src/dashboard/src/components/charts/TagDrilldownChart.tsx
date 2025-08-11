import React from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Chip,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import TagUsageChart from "./TagUsageChart";
import { formatCurrency } from "../../utils/currency";
import type { TagUsageData } from "../../types";

interface TagDrilldownChartProps {
  parentTag: TagUsageData;
  childTags: TagUsageData[];
  onClose: () => void;
  onChildClick?: (tag: TagUsageData) => void;
}

const TagDrilldownChart: React.FC<TagDrilldownChartProps> = ({
  parentTag,
  childTags,
  onClose,
  onChildClick,
}) => {
  // Filter child tags that belong to this parent
  const relevantChildren = childTags.filter(
    (tag) =>
      tag.path.startsWith(parentTag.path + "/") &&
      tag.path.split("/").length === parentTag.path.split("/").length + 1,
  );

  const totalChildUsage = relevantChildren.reduce(
    (sum, child) => sum + child.usage,
    0,
  );
  const totalChildRequests = relevantChildren.reduce(
    (sum, child) => sum + child.requests,
    0,
  );

  return (
    <Card>
      <CardHeader
        title={
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Typography variant="subtitle1">
              Children of "{parentTag.tagName}"
            </Typography>
            <Chip
              label={`${relevantChildren.length} child tags`}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Box>
        }
        action={
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        }
        sx={{ pb: 1 }}
      />

      <CardContent sx={{ p: 2, pt: 0 }}>
        {relevantChildren.length > 0 ? (
          <>
            {/* Parent tag summary */}
            <Box
              sx={{
                mb: 2,
                p: 2,
                backgroundColor: "action.hover",
                borderRadius: 1,
              }}
            >
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Parent Tag Summary
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    {parentTag.tagName} ({parentTag.path})
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 2, textAlign: "right" }}>
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {formatCurrency(parentTag.usage)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Total Usage
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {parentTag.requests.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Total Requests
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Box>

            {/* Child breakdown chart */}
            <TagUsageChart
              data={relevantChildren}
              title="Child Tag Breakdown"
              height={300}
              showLegend={true}
              onTagClick={onChildClick}
              showRootOnly={false}
            />

            {/* Child summary stats */}
            <Box
              sx={{
                mt: 2,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Child Tags Subtotal:
              </Typography>
              <Box sx={{ display: "flex", gap: 2, textAlign: "right" }}>
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    {formatCurrency(totalChildUsage)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Usage
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    {totalChildRequests.toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Requests
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    {parentTag.usage > 0
                      ? ((totalChildUsage / parentTag.usage) * 100).toFixed(1)
                      : 0}
                    %
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    of Parent
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Attribution note */}
            {Math.abs(totalChildUsage - parentTag.usage) > 0.01 && (
              <Box
                sx={{
                  mt: 2,
                  p: 1.5,
                  backgroundColor: "info.light",
                  borderRadius: 1,
                  opacity: 0.7,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Note: Parent usage may include direct usage not attributed to
                  child tags, or child usage may be partially attributed to the
                  parent.
                </Typography>
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No child tags found for "{parentTag.tagName}".
            </Typography>
            <Typography variant="caption" color="text.secondary">
              This tag may be a leaf node or children may not have usage data.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default TagDrilldownChart;
