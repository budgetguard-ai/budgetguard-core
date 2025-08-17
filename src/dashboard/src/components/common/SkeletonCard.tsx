import React from "react";
import { Card, CardContent, Skeleton, Box } from "@mui/material";

interface SkeletonCardProps {
  height?: number;
  showTitle?: boolean;
  showSubtitle?: boolean;
  lines?: number;
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({
  height = 120,
  showTitle = true,
  showSubtitle = false,
  lines = 2,
}) => {
  return (
    <Card sx={{ height }}>
      <CardContent>
        {showTitle && (
          <Skeleton
            variant="text"
            width="60%"
            height={24}
            sx={{ mb: showSubtitle ? 1 : 2 }}
          />
        )}
        {showSubtitle && (
          <Skeleton variant="text" width="40%" height={20} sx={{ mb: 2 }} />
        )}
        <Box>
          {Array.from({ length: lines }, (_, index) => (
            <Skeleton
              key={index}
              variant="text"
              width={index === lines - 1 ? "80%" : "100%"}
              height={16}
              sx={{ mb: 0.5 }}
            />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};

export default SkeletonCard;
