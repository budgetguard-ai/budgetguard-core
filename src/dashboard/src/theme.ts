import { createTheme } from "@mui/material/styles";

// Material Design 3 color tokens
const lightColorTokens = {
  primary: {
    main: "#6750A4",
    light: "#EADDFF",
    dark: "#21005D",
    contrastText: "#FFFFFF",
  },
  secondary: {
    main: "#625B71",
    light: "#E8DEF8",
    dark: "#1D192B",
    contrastText: "#FFFFFF",
  },
  error: {
    main: "#BA1A1A",
    light: "#FFDAD6",
    dark: "#410002",
    contrastText: "#FFFFFF",
  },
  warning: {
    main: "#7D5260",
    light: "#FFD8E4",
    dark: "#31111D",
    contrastText: "#FFFFFF",
  },
  info: {
    main: "#006A6B",
    light: "#4CFAFF",
    dark: "#002020",
    contrastText: "#FFFFFF",
  },
  success: {
    main: "#006E1C",
    light: "#9EFF9C",
    dark: "#002204",
    contrastText: "#FFFFFF",
  },
  background: {
    default: "#FFFBFE",
    paper: "#F7F2FA",
  },
  surface: {
    main: "#FFFBFE",
    variant: "#E7E0EC",
  },
};

const darkColorTokens = {
  primary: {
    main: "#D0BCFF",
    light: "#4F378B",
    dark: "#EADDFF",
    contrastText: "#21005D",
  },
  secondary: {
    main: "#CCC2DC",
    light: "#4A4458",
    dark: "#E8DEF8",
    contrastText: "#1D192B",
  },
  error: {
    main: "#FFB4AB",
    light: "#93000A",
    dark: "#FFDAD6",
    contrastText: "#410002",
  },
  warning: {
    main: "#EFB8C8",
    light: "#633B48",
    dark: "#FFD8E4",
    contrastText: "#31111D",
  },
  info: {
    main: "#4DDADB",
    light: "#00504F",
    dark: "#A6F3F3",
    contrastText: "#002020",
  },
  success: {
    main: "#82D884",
    light: "#00530F",
    dark: "#9EFF9C",
    contrastText: "#002204",
  },
  background: {
    default: "#1C1B1F",
    paper: "#2B2930",
  },
  surface: {
    main: "#1C1B1F",
    variant: "#49454F",
  },
};

// Create light theme
export const lightTheme = createTheme({
  palette: {
    mode: "light",
    ...lightColorTokens,
  },
  typography: {
    fontFamily: [
      "Inter",
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      '"Helvetica Neue"',
      "Arial",
      "sans-serif",
    ].join(","),
    h1: {
      fontSize: "3.5rem",
      fontWeight: 400,
      lineHeight: 1.167,
    },
    h2: {
      fontSize: "2.25rem",
      fontWeight: 400,
      lineHeight: 1.2,
    },
    h3: {
      fontSize: "1.75rem",
      fontWeight: 400,
      lineHeight: 1.167,
    },
    h4: {
      fontSize: "1.5rem",
      fontWeight: 400,
      lineHeight: 1.235,
    },
    h5: {
      fontSize: "1.25rem",
      fontWeight: 400,
      lineHeight: 1.334,
    },
    h6: {
      fontSize: "1.125rem",
      fontWeight: 500,
      lineHeight: 1.6,
    },
    body1: {
      fontSize: "1rem",
      fontWeight: 400,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: "0.875rem",
      fontWeight: 400,
      lineHeight: 1.43,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: 20,
          fontWeight: 500,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow:
            "0px 1px 3px rgba(0, 0, 0, 0.12), 0px 1px 2px rgba(0, 0, 0, 0.24)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
});

// Create dark theme
export const darkTheme = createTheme({
  palette: {
    mode: "dark",
    ...darkColorTokens,
  },
  typography: lightTheme.typography,
  shape: lightTheme.shape,
  components: {
    ...lightTheme.components,
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow:
            "0px 2px 4px rgba(0, 0, 0, 0.3), 0px 4px 8px rgba(0, 0, 0, 0.15)",
        },
      },
    },
  },
});

// Default theme (light)
export const theme = lightTheme;
