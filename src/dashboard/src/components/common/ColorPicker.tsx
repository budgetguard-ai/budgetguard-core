import React, { useState } from "react";
import {
  Box,
  Popover,
  Button,
  Grid,
  Typography,
  TextField,
} from "@mui/material";
import { Palette as PaletteIcon } from "@mui/icons-material";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

const predefinedColors = [
  "#1976d2", // Blue
  "#d32f2f", // Red
  "#2e7d32", // Green
  "#ed6c02", // Orange
  "#9c27b0", // Purple
  "#0288d1", // Light Blue
  "#f57c00", // Amber
  "#388e3c", // Light Green
  "#7b1fa2", // Deep Purple
  "#1565c0", // Blue
  "#c62828", // Dark Red
  "#558b2f", // Olive
  "#f9a825", // Yellow
  "#00695c", // Teal
  "#4527a0", // Indigo
  "#6a1b9a", // Purple
];

export const ColorPicker: React.FC<ColorPickerProps> = ({
  color,
  onChange,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [customColor, setCustomColor] = useState(color);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleColorSelect = (selectedColor: string) => {
    onChange(selectedColor);
    setCustomColor(selectedColor);
    handleClose();
  };

  const handleCustomColorChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const newColor = event.target.value;
    setCustomColor(newColor);

    // Validate hex color format
    if (/^#[0-9A-F]{6}$/i.test(newColor)) {
      onChange(newColor);
    }
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <Button
        onClick={handleClick}
        variant="outlined"
        startIcon={<PaletteIcon />}
        sx={{
          justifyContent: "flex-start",
          gap: 1,
        }}
      >
        <Box
          sx={{
            width: 20,
            height: 20,
            backgroundColor: color,
            borderRadius: "50%",
            border: "2px solid",
            borderColor: "divider",
          }}
        />
        {color}
      </Button>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
      >
        <Box sx={{ p: 2, width: 280 }}>
          <Typography variant="subtitle2" gutterBottom>
            Choose a color
          </Typography>

          <Grid container spacing={1} sx={{ mb: 2 }}>
            {predefinedColors.map((presetColor) => (
              <Grid item key={presetColor}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    backgroundColor: presetColor,
                    borderRadius: "50%",
                    border: color === presetColor ? "3px solid" : "1px solid",
                    borderColor:
                      color === presetColor ? "primary.main" : "divider",
                    cursor: "pointer",
                    "&:hover": {
                      transform: "scale(1.1)",
                    },
                    transition: "all 0.2s",
                  }}
                  onClick={() => handleColorSelect(presetColor)}
                />
              </Grid>
            ))}
          </Grid>

          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
            Or enter custom hex color:
          </Typography>

          <TextField
            value={customColor}
            onChange={handleCustomColorChange}
            size="small"
            placeholder="#1976d2"
            fullWidth
            InputProps={{
              startAdornment: (
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    backgroundColor: customColor,
                    borderRadius: "50%",
                    border: "1px solid",
                    borderColor: "divider",
                    mr: 1,
                    flexShrink: 0,
                  }}
                />
              ),
            }}
          />
        </Box>
      </Popover>
    </>
  );
};
