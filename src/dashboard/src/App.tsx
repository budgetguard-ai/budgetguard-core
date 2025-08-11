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
import UsageHistory from "./pages/UsageHistory";
import Models from "./pages/Models";
import Settings from "./pages/Settings";
import Tags from "./pages/Tags";
import TagManagement from "./pages/TagManagement";

const App: FC = () => {
  return (
    <Router basename="/dashboard">
      <Box sx={{ display: "flex", minHeight: "100vh" }}>
        <DashboardLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/usage" replace />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/tags" element={<Tags />} />
            <Route path="/tag-management" element={<TagManagement />} />
            <Route path="/tenants" element={<Tenants />} />
            <Route path="/usage" element={<Usage />} />
            <Route path="/usage-history" element={<UsageHistory />} />
            <Route path="/models" element={<Models />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </DashboardLayout>
      </Box>
    </Router>
  );
};

export default App;
