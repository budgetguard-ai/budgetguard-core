import React from "react";
import { FormControl, InputLabel, Select, MenuItem } from "@mui/material";

export type TimeRangeOption = "1w" | "lw" | "1m" | "lm" | "7d" | "30d" | "90d";

interface TimeRangeSelectorProps {
  value: TimeRangeOption;
  onChange: (value: TimeRangeOption) => void;
  size?: "small" | "medium";
  minWidth?: number;
}

const TIME_RANGE_OPTIONS = [
  { value: "1w" as const, label: "This week" },
  { value: "lw" as const, label: "Last week" },
  { value: "1m" as const, label: "This month" },
  { value: "lm" as const, label: "Last month" },
  { value: "7d" as const, label: "Last 7 days" },
  { value: "30d" as const, label: "Last 30 days" },
  { value: "90d" as const, label: "Last 90 days" },
];

const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
  value,
  onChange,
  size = "small",
  minWidth = 120,
}) => {
  return (
    <FormControl size={size} sx={{ minWidth }}>
      <InputLabel>Time Range</InputLabel>
      <Select
        value={value}
        label="Time Range"
        onChange={(e) => onChange(e.target.value as TimeRangeOption)}
      >
        {TIME_RANGE_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default TimeRangeSelector;
export { TIME_RANGE_OPTIONS };
