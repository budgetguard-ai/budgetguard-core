import React from "react";
import { Box, Typography, Card, CardContent } from "@mui/material";

const Usage: React.FC = () => {
  return (
    <Box>
      <Typography
        variant="h4"
        component="h1"
        gutterBottom
        sx={{ fontWeight: 600, mb: 4 }}
      >
        Usage Analytics
      </Typography>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Coming Soon
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Usage analytics and charts will be implemented in Phase 3.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Usage;
