/**
 * Utility functions for calculating date ranges
 */

export interface DateRangeOptions {
  days?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * Formats a date to YYYY-MM-DD string using local timezone
 */
function formatDateLocal(date: Date): string {
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

/**
 * Calculate date range options for API calls based on time range selection
 */
export function getDateRangeForRange(range: string): DateRangeOptions {
  const now = new Date();

  switch (range) {
    case "1w": {
      // This week: from Sunday to today
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Go to Sunday
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(now);
      endOfWeek.setHours(23, 59, 59, 999);

      return {
        startDate: formatDateLocal(startOfWeek),
        endDate: formatDateLocal(endOfWeek),
      };
    }
    case "lw": {
      // Last week: complete Sunday-Saturday week
      const startOfLastWeek = new Date(now);
      startOfLastWeek.setDate(now.getDate() - now.getDay() - 7); // Go to last Sunday
      startOfLastWeek.setHours(0, 0, 0, 0);
      const endOfLastWeek = new Date(startOfLastWeek);
      endOfLastWeek.setDate(startOfLastWeek.getDate() + 6); // Go to Saturday
      endOfLastWeek.setHours(23, 59, 59, 999);

      return {
        startDate: formatDateLocal(startOfLastWeek),
        endDate: formatDateLocal(endOfLastWeek),
      };
    }
    case "1m": {
      // This month: from 1st of current month to today
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now);
      endOfMonth.setHours(23, 59, 59, 999);

      return {
        startDate: formatDateLocal(startOfMonth),
        endDate: formatDateLocal(endOfMonth),
      };
    }
    case "lm": {
      // Last month: complete previous month
      const startOfLastMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      );
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
      endOfLastMonth.setHours(23, 59, 59, 999);

      return {
        startDate: formatDateLocal(startOfLastMonth),
        endDate: formatDateLocal(endOfLastMonth),
      };
    }
    case "7d":
      return { days: 7 };
    case "30d":
      return { days: 30 };
    case "90d":
      return { days: 90 };
    default:
      return { days: 30 };
  }
}