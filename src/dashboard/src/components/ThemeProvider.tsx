import React from "react";
import { ThemeProvider as MuiThemeProvider } from "@mui/material";
import { useDashboardStore } from "../hooks/useStore";
import { lightTheme, darkTheme } from "../theme";

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { theme } = useDashboardStore();
  const currentTheme = theme === "dark" ? darkTheme : lightTheme;

  return <MuiThemeProvider theme={currentTheme}>{children}</MuiThemeProvider>;
};
