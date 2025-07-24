import React from "react";
import { Box, Typography, Card, CardContent } from "@mui/material";

const Settings: React.FC = () => {
  return (
    <Box>
      <Typography
        variant="h4"
        component="h1"
        gutterBottom
        sx={{ fontWeight: 600, mb: 4 }}
      >
        Settings
      </Typography>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Coming Soon
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Model pricing management and other settings will be implemented in
            Phase 3.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Settings;
