import React, { useState } from "react";
import {
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useTheme,
  useMediaQuery,
  Divider,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Settings as SettingsIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  History as HistoryIcon,
  SmartToy as ModelsIcon,
  LocalOffer as TagIcon,
  ManageAccounts as ManageAccountsIcon,
  PlayCircle as SessionsIcon,
  AccountBalanceWallet as BudgetIcon,
  TrendingUp as InsightsIcon,
} from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import { useDashboardStore } from "../../hooks/useStore";
import logoPng from "../../assets/logo.png";

const drawerWidth = 240;

interface NavigationItem {
  text: string;
  icon: React.ReactElement;
  path: string;
  section?: string;
}

const navigationItems: NavigationItem[] = [
  {
    text: "Budget Health",
    icon: <BudgetIcon />,
    path: "/",
    section: "OVERVIEW",
  },
  {
    text: "Usage Insights",
    icon: <InsightsIcon />,
    path: "/usage-insights",
    section: "OVERVIEW",
  },
  {
    text: "Usage Tracking",
    icon: <HistoryIcon />,
    path: "/usage-tracking",
    section: "MONITORING",
  },
  {
    text: "Sessions",
    icon: <SessionsIcon />,
    path: "/sessions",
    section: "MONITORING",
  },
  {
    text: "Manage Tenants",
    icon: <ManageAccountsIcon />,
    path: "/admin/tenants",
    section: "ADMIN",
  },
  {
    text: "Manage Tags",
    icon: <TagIcon />,
    path: "/admin/tags",
    section: "ADMIN",
  },
  { text: "Models", icon: <ModelsIcon />, path: "/models", section: "ADMIN" },
  {
    text: "Settings",
    icon: <SettingsIcon />,
    path: "/settings",
    section: "ADMIN",
  },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme: appTheme, toggleTheme } = useDashboardStore();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const drawer = (
    <div>
      <Toolbar>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.1 }}>
          <img
            src={logoPng}
            alt="BudgetGuard Logo"
            style={{
              width: 48,
              height: 48,
            }}
          />
          <Typography
            variant="h5"
            noWrap
            component="div"
            sx={{
              fontWeight: 700,
              fontFamily: '"Urbanist", sans-serif',
            }}
          >
            BudgetGuard
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <List>
        {(() => {
          const groupedItems = navigationItems.reduce(
            (acc, item) => {
              const section = item.section || "OTHER";
              if (!acc[section]) acc[section] = [];
              acc[section].push(item);
              return acc;
            },
            {} as Record<string, NavigationItem[]>,
          );

          return Object.entries(groupedItems).map(
            ([sectionName, items], sectionIndex) => (
              <React.Fragment key={sectionName}>
                {sectionIndex > 0 && <Divider sx={{ my: 1 }} />}
                <Box sx={{ px: 2, py: 1 }}>
                  <Typography
                    variant="overline"
                    sx={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: theme.palette.text.secondary,
                      letterSpacing: 1.2,
                    }}
                  >
                    {sectionName}
                  </Typography>
                </Box>
                {items.map((item) => (
                  <ListItem key={item.text} disablePadding>
                    <ListItemButton
                      selected={location.pathname === item.path}
                      onClick={() => handleNavigation(item.path)}
                      sx={{
                        borderRadius: 2,
                        mx: 1,
                        my: 0.25,
                        "&.Mui-selected": {
                          backgroundColor: theme.palette.primary.main,
                          color: theme.palette.primary.contrastText,
                          "&:hover": {
                            backgroundColor: theme.palette.primary.dark,
                          },
                          "& .MuiListItemIcon-root": {
                            color: theme.palette.primary.contrastText,
                          },
                        },
                      }}
                    >
                      <ListItemIcon
                        sx={{
                          color:
                            location.pathname === item.path
                              ? theme.palette.primary.contrastText
                              : theme.palette.text.secondary,
                        }}
                      >
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText
                        primary={item.text}
                        primaryTypographyProps={{
                          fontWeight:
                            location.pathname === item.path ? 600 : 400,
                          fontSize: "0.875rem",
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </React.Fragment>
            ),
          );
        })()}
      </List>
      <Divider sx={{ mt: "auto" }} />
      <Box sx={{ p: 2, display: "flex", justifyContent: "center", gap: 1 }}>
        <IconButton
          onClick={toggleTheme}
          size="small"
          sx={{
            color:
              appTheme === "light"
                ? theme.palette.primary.main
                : theme.palette.text.secondary,
            "&:hover": {
              backgroundColor: theme.palette.action.hover,
            },
          }}
        >
          <LightModeIcon />
        </IconButton>
        <IconButton
          onClick={toggleTheme}
          size="small"
          sx={{
            color:
              appTheme === "dark"
                ? theme.palette.primary.main
                : theme.palette.text.secondary,
            "&:hover": {
              backgroundColor: theme.palette.action.hover,
            },
          }}
        >
          <DarkModeIcon />
        </IconButton>
      </Box>
    </div>
  );

  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      {/* Mobile menu button - only visible on mobile when drawer is closed */}
      {isMobile && (
        <Box
          sx={{
            position: "fixed",
            top: 16,
            left: 16,
            zIndex: theme.zIndex.drawer + 1,
            display: mobileOpen ? "none" : "block",
          }}
        >
          <IconButton
            color="primary"
            aria-label="open drawer"
            onClick={handleDrawerToggle}
            sx={{
              backgroundColor: theme.palette.background.paper,
              boxShadow: theme.shadows[2],
              "&:hover": {
                backgroundColor: theme.palette.action.hover,
              },
            }}
          >
            <MenuIcon />
          </IconButton>
        </Box>
      )}

      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
              backgroundColor: theme.palette.background.default,
            },
          }}
        >
          {drawer}
        </Drawer>

        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
              backgroundColor: theme.palette.background.default,
              borderRight: `1px solid ${theme.palette.divider}`,
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          minHeight: "100vh",
          backgroundColor: theme.palette.background.default,
        }}
      >
        {/* No toolbar spacer needed since AppBar is removed */}
        {children}
      </Box>
    </Box>
  );
};

export default DashboardLayout;
