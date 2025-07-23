import { FC } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Box } from "@mui/material";
import DashboardLayout from "./components/layout/DashboardLayout";
import Overview from "./pages/Overview";
import Tenants from "./pages/Tenants";
import Usage from "./pages/Usage";
import Settings from "./pages/Settings";

const App: FC = () => {
  return (
    <Router basename="/dashboard">
      <Box sx={{ display: "flex", minHeight: "100vh" }}>
        <DashboardLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/tenants" element={<Tenants />} />
            <Route path="/usage" element={<Usage />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </DashboardLayout>
      </Box>
    </Router>
  );
};

export default App;
