import React from "react";
import { Box, Typography, Card, CardContent, Alert } from "@mui/material";
import { Construction as ConstructionIcon } from "@mui/icons-material";

const Sessions: React.FC = () => {
  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mb: 4 }}>
        Sessions
      </Typography>

      <Card>
        <CardContent>
          <Alert
            severity="info"
            icon={<ConstructionIcon />}
            sx={{
              display: "flex",
              alignItems: "center",
              backgroundColor: "background.paper",
              border: "1px solid",
              borderColor: "primary.main",
            }}
          >
            <Box>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Coming Soon
              </Typography>
              <Typography variant="body2">
                Session management and analytics features will be available in
                the next iteration. This page will provide insights into
                conversation sessions, including duration, token usage patterns,
                and session-based analytics.
              </Typography>
            </Box>
          </Alert>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Sessions;
