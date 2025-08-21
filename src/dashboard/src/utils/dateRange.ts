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
 * Formats a date to YYYY-MM-DD string using UTC timezone
 * Use this for budget/usage queries to match enforcement periods
 */
function formatDateUTC(date: Date): string {
  return (
    date.getUTCFullYear() +
    "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getUTCDate()).padStart(2, "0")
  );
}

/**
 * Calculate date range options for budget/usage API calls using UTC periods
 * This matches the enforcement logic which operates in UTC
 */
export function getBudgetDateRangeForRange(range: string): DateRangeOptions {
  const nowUTC = new Date();

  switch (range) {
    case "1w": {
      // This week: from Sunday to today (UTC)
      const startOfWeekUTC = new Date(nowUTC);
      startOfWeekUTC.setUTCDate(nowUTC.getUTCDate() - nowUTC.getUTCDay()); // Go to Sunday
      startOfWeekUTC.setUTCHours(0, 0, 0, 0);
      const endOfWeekUTC = new Date(nowUTC);
      endOfWeekUTC.setUTCHours(23, 59, 59, 999);

      return {
        startDate: formatDateUTC(startOfWeekUTC),
        endDate: formatDateUTC(endOfWeekUTC),
      };
    }
    case "lw": {
      // Last week: complete Sunday-Saturday week (UTC)
      const startOfLastWeekUTC = new Date(nowUTC);
      startOfLastWeekUTC.setUTCDate(
        nowUTC.getUTCDate() - nowUTC.getUTCDay() - 7,
      ); // Go to last Sunday
      startOfLastWeekUTC.setUTCHours(0, 0, 0, 0);
      const endOfLastWeekUTC = new Date(startOfLastWeekUTC);
      endOfLastWeekUTC.setUTCDate(startOfLastWeekUTC.getUTCDate() + 6); // Go to Saturday
      endOfLastWeekUTC.setUTCHours(23, 59, 59, 999);

      return {
        startDate: formatDateUTC(startOfLastWeekUTC),
        endDate: formatDateUTC(endOfLastWeekUTC),
      };
    }
    case "1m": {
      // This month: from 1st of current month to today (UTC)
      const startOfMonthUTC = new Date(
        Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), 1),
      );
      const endOfMonthUTC = new Date(nowUTC);
      endOfMonthUTC.setUTCHours(23, 59, 59, 999);

      return {
        startDate: formatDateUTC(startOfMonthUTC),
        endDate: formatDateUTC(endOfMonthUTC),
      };
    }
    case "lm": {
      // Last month: complete previous month (UTC)
      const startOfLastMonthUTC = new Date(
        Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth() - 1, 1),
      );
      const endOfLastMonthUTC = new Date(
        Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), 0),
      ); // Last day of previous month
      endOfLastMonthUTC.setUTCHours(23, 59, 59, 999);

      return {
        startDate: formatDateUTC(startOfLastMonthUTC),
        endDate: formatDateUTC(endOfLastMonthUTC),
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

/**
 * Calculate date range options for general API calls based on time range selection
 * Uses local timezone for better UX with non-budget data
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
