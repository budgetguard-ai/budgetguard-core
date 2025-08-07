import { createTheme } from "@mui/material/styles";

// Liquid Glass Design color tokens
const lightColorTokens = {
  primary: {
    main: "#1C1C1E",
    light: "rgba(28, 28, 30, 0.1)",
    dark: "#000000",
    contrastText: "#FFFFFF",
  },
  secondary: {
    main: "#8E8E93",
    light: "rgba(142, 142, 147, 0.1)",
    dark: "#636366",
    contrastText: "#FFFFFF",
  },
  error: {
    main: "#FF3B30",
    light: "rgba(255, 59, 48, 0.1)",
    dark: "#D70015",
    contrastText: "#FFFFFF",
  },
  warning: {
    main: "#FF9500",
    light: "rgba(255, 149, 0, 0.1)",
    dark: "#FF8C00",
    contrastText: "#FFFFFF",
  },
  info: {
    main: "#8E8E93",
    light: "rgba(142, 142, 147, 0.1)",
    dark: "#636366",
    contrastText: "#FFFFFF",
  },
  success: {
    main: "#34C759",
    light: "rgba(52, 199, 89, 0.1)",
    dark: "#28A745",
    contrastText: "#FFFFFF",
  },
  background: {
    default: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
    paper: "rgba(255, 255, 255, 0.25)",
  },
  surface: {
    main: "rgba(255, 255, 255, 0.3)",
    variant: "rgba(248, 250, 252, 0.4)",
  },
};

const darkColorTokens = {
  primary: {
    main: "#E0E0E0",
    light: "rgba(224, 224, 224, 0.1)",
    dark: "#BDBDBD",
    contrastText: "#000000",
  },
  secondary: {
    main: "#9E9E9E",
    light: "rgba(158, 158, 158, 0.1)",
    dark: "#757575",
    contrastText: "#FFFFFF",
  },
  error: {
    main: "#FF5252",
    light: "rgba(255, 82, 82, 0.1)",
    dark: "#F44336",
    contrastText: "#FFFFFF",
  },
  warning: {
    main: "#FFC107",
    light: "rgba(255, 193, 7, 0.1)",
    dark: "#FF9800",
    contrastText: "#000000",
  },
  info: {
    main: "#9E9E9E",
    light: "rgba(158, 158, 158, 0.1)",
    dark: "#757575",
    contrastText: "#FFFFFF",
  },
  success: {
    main: "#4CAF50",
    light: "rgba(76, 175, 80, 0.1)",
    dark: "#388E3C",
    contrastText: "#FFFFFF",
  },
  background: {
    default: "#000000",
    paper: "rgba(255, 255, 255, 0.1)",
  },
  surface: {
    main: "rgba(255, 255, 255, 0.05)",
    variant: "rgba(255, 255, 255, 0.08)",
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
      "Manrope",
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      '"Helvetica Neue"',
      "Arial",
      "sans-serif",
    ].join(","),
    h1: {
      fontSize: "3rem",
      fontWeight: 400,
      lineHeight: 1.167,
    },
    h2: {
      fontSize: "2rem",
      fontWeight: 400,
      lineHeight: 1.2,
    },
    h3: {
      fontSize: "1.5rem",
      fontWeight: 400,
      lineHeight: 1.167,
    },
    h4: {
      fontSize: "1.25rem",
      fontWeight: 400,
      lineHeight: 1.235,
    },
    h5: {
      fontSize: "1.125rem",
      fontWeight: 400,
      lineHeight: 1.334,
    },
    h6: {
      fontSize: "1rem",
      fontWeight: 500,
      lineHeight: 1.6,
    },
    subtitle1: {
      fontSize: "0.9375rem",
      fontWeight: 500,
      lineHeight: 1.5,
    },
    subtitle2: {
      fontSize: "0.8125rem",
      fontWeight: 500,
      lineHeight: 1.57,
    },
    body1: {
      fontSize: "0.875rem",
      fontWeight: 400,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: "0.75rem",
      fontWeight: 400,
      lineHeight: 1.43,
    },
    caption: {
      fontSize: "0.6875rem",
      fontWeight: 400,
      lineHeight: 1.66,
    },
    overline: {
      fontSize: "0.625rem",
      fontWeight: 400,
      lineHeight: 2.66,
      letterSpacing: "0.08333em",
      textTransform: "uppercase",
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
          borderRadius: 8,
          fontWeight: 500,
          transition: "all 0.2s ease-out",
        },
        contained: {
          backdropFilter: "blur(20px) saturate(180%)",
          background: "rgba(0, 0, 0, 0.8)",
          border: "1px solid rgba(0, 0, 0, 0.9)",
          color: "#FFFFFF",
          "&:hover": {
            background: "rgba(0, 0, 0, 0.9)",
            borderColor: "rgba(0, 0, 0, 1)",
          },
        },
        outlined: {
          backdropFilter: "blur(20px) saturate(180%)",
          background: "rgba(255, 255, 255, 0.8)",
          border: "1px solid rgba(0, 0, 0, 0.2)",
          color: "rgba(0, 0, 0, 0.87)",
          "&:hover": {
            background: "rgba(255, 255, 255, 0.9)",
            borderColor: "rgba(0, 0, 0, 0.3)",
          },
        },
        text: {
          color: "rgba(0, 0, 0, 0.87)",
          "&:hover": {
            background: "rgba(0, 0, 0, 0.04)",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          backdropFilter: "blur(40px) saturate(200%)",
          background: "rgba(255, 255, 255, 0.25)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          boxShadow: "0 8px 32px rgba(31, 38, 135, 0.37)",
          transition: "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          "&:hover": {
            transform: "translateY(-2px)",
            boxShadow: "0 12px 40px rgba(31, 38, 135, 0.5)",
            background: "rgba(255, 255, 255, 0.35)",
          },
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: "16px",
          "&:last-child": {
            paddingBottom: "16px",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
        },
        colorPrimary: {
          backdropFilter: "blur(20px) saturate(180%)",
          background: "rgba(28, 28, 30, 0.9)",
          color: "#FFFFFF",
          border: "1px solid rgba(28, 28, 30, 1)",
        },
        colorSecondary: {
          backdropFilter: "blur(20px) saturate(180%)",
          background: "rgba(142, 142, 147, 0.9)",
          color: "#FFFFFF",
          border: "1px solid rgba(142, 142, 147, 1)",
        },
        colorSuccess: {
          backdropFilter: "blur(20px) saturate(180%)",
          background: "rgba(52, 199, 89, 0.9)",
          color: "#FFFFFF",
          border: "1px solid rgba(52, 199, 89, 1)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backdropFilter: "blur(25px) saturate(200%)",
          background: "rgba(255, 255, 255, 0.2)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 8px 32px rgba(31, 38, 135, 0.3)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backdropFilter: "blur(40px) saturate(200%)",
          background: "rgba(255, 255, 255, 0.15)",
          border: "none",
          borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
          boxShadow: "0 4px 16px rgba(31, 38, 135, 0.2)",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 20,
          backdropFilter: "blur(40px) saturate(200%)",
          background: "rgba(255, 255, 255, 0.25)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          boxShadow: "0 8px 32px rgba(31, 38, 135, 0.37)",
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backdropFilter: "blur(8px)",
          background: "rgba(31, 38, 135, 0.1)",
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          backdropFilter: "blur(25px) saturate(200%)",
          background: "rgba(255, 255, 255, 0.2)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 8px 32px rgba(31, 38, 135, 0.3)",
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          backdropFilter: "blur(25px) saturate(200%)",
          background: "rgba(255, 255, 255, 0.2)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 8px 32px rgba(31, 38, 135, 0.3)",
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
        },
        standardWarning: {
          background: "rgba(255, 152, 0, 0.15)",
          color: "rgba(0, 0, 0, 0.87)",
          border: "1px solid rgba(255, 152, 0, 0.3)",
          "& .MuiAlert-icon": {
            color: "#FF9800",
          },
        },
        standardInfo: {
          background: "rgba(33, 150, 243, 0.15)",
          color: "rgba(0, 0, 0, 0.87)",
          border: "1px solid rgba(33, 150, 243, 0.3)",
          "& .MuiAlert-icon": {
            color: "#2196F3",
          },
        },
        standardError: {
          background: "rgba(244, 67, 54, 0.15)",
          color: "rgba(0, 0, 0, 0.87)",
          border: "1px solid rgba(244, 67, 54, 0.3)",
          "& .MuiAlert-icon": {
            color: "#F44336",
          },
        },
        standardSuccess: {
          background: "rgba(76, 175, 80, 0.15)",
          color: "rgba(0, 0, 0, 0.87)",
          border: "1px solid rgba(76, 175, 80, 0.3)",
          "& .MuiAlert-icon": {
            color: "#4CAF50",
          },
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
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: 8,
          fontWeight: 500,
          transition: "all 0.2s ease-out",
        },
        contained: {
          backdropFilter: "blur(20px) saturate(180%)",
          background: "rgba(255, 255, 255, 0.8)",
          border: "1px solid rgba(255, 255, 255, 0.9)",
          color: "#000000",
          "&:hover": {
            background: "rgba(255, 255, 255, 0.9)",
            borderColor: "rgba(255, 255, 255, 1)",
          },
        },
        outlined: {
          backdropFilter: "blur(20px) saturate(180%)",
          background: "rgba(255, 255, 255, 0.05)",
          border: "1px solid rgba(255, 255, 255, 0.3)",
          color: "rgba(255, 255, 255, 0.87)",
          "&:hover": {
            background: "rgba(255, 255, 255, 0.1)",
            borderColor: "rgba(255, 255, 255, 0.5)",
          },
        },
        text: {
          color: "rgba(255, 255, 255, 0.87)",
          "&:hover": {
            background: "rgba(255, 255, 255, 0.04)",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          backdropFilter: "blur(40px) saturate(200%)",
          background: "rgba(255, 255, 255, 0.1)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          boxShadow: "0 8px 32px rgba(255, 255, 255, 0.1)",
          transition: "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          "&:hover": {
            transform: "translateY(-2px)",
            boxShadow: "0 12px 40px rgba(255, 255, 255, 0.15)",
            background: "rgba(255, 255, 255, 0.15)",
          },
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: "16px",
          "&:last-child": {
            paddingBottom: "16px",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
        },
        colorPrimary: {
          backdropFilter: "blur(20px) saturate(180%)",
          background: "rgba(224, 224, 224, 0.9)",
          color: "#000000",
          border: "1px solid rgba(224, 224, 224, 1)",
        },
        colorSecondary: {
          backdropFilter: "blur(20px) saturate(180%)",
          background: "rgba(158, 158, 158, 0.3)",
          color: "#FFFFFF",
          border: "1px solid rgba(158, 158, 158, 0.8)",
          fontWeight: 600,
        },
        colorSuccess: {
          backdropFilter: "blur(20px) saturate(180%)",
          background: "rgba(76, 175, 80, 0.9)",
          color: "#FFFFFF",
          border: "1px solid rgba(76, 175, 80, 1)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backdropFilter: "blur(25px) saturate(200%)",
          background: "rgba(255, 255, 255, 0.08)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 8px 32px rgba(255, 255, 255, 0.1)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backdropFilter: "blur(40px) saturate(200%)",
          background: "rgba(255, 255, 255, 0.05)",
          border: "none",
          borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
          boxShadow: "0 4px 16px rgba(255, 255, 255, 0.1)",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 20,
          backdropFilter: "blur(40px) saturate(200%)",
          background: "rgba(255, 255, 255, 0.1)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          boxShadow: "0 8px 32px rgba(255, 255, 255, 0.15)",
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backdropFilter: "blur(8px)",
          background: "rgba(0, 0, 0, 0.1)",
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          backdropFilter: "blur(25px) saturate(200%)",
          background: "rgba(255, 255, 255, 0.08)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 8px 32px rgba(255, 255, 255, 0.1)",
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          backdropFilter: "blur(25px) saturate(200%)",
          background: "rgba(255, 255, 255, 0.08)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 8px 32px rgba(255, 255, 255, 0.1)",
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
        },
        standardWarning: {
          background: "rgba(255, 193, 7, 0.15)",
          color: "rgba(255, 255, 255, 0.87)",
          border: "1px solid rgba(255, 193, 7, 0.3)",
          "& .MuiAlert-icon": {
            color: "#FFC107",
          },
        },
        standardInfo: {
          background: "rgba(158, 158, 158, 0.15)",
          color: "rgba(255, 255, 255, 0.87)",
          border: "1px solid rgba(158, 158, 158, 0.3)",
          "& .MuiAlert-icon": {
            color: "#9E9E9E",
          },
        },
        standardError: {
          background: "rgba(255, 82, 82, 0.15)",
          color: "rgba(255, 255, 255, 0.87)",
          border: "1px solid rgba(255, 82, 82, 0.3)",
          "& .MuiAlert-icon": {
            color: "#FF5252",
          },
        },
        standardSuccess: {
          background: "rgba(76, 175, 80, 0.15)",
          color: "rgba(255, 255, 255, 0.87)",
          border: "1px solid rgba(76, 175, 80, 0.3)",
          "& .MuiAlert-icon": {
            color: "#4CAF50",
          },
        },
      },
    },
  },
});

// Default theme (light)
export const theme = lightTheme;
