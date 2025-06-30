export function getBudgetPeriods(): string[] {
  const raw =
    process.env.BUDGET_PERIODS || process.env.BUDGET_PERIOD || "monthly";
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function ledgerKey(period: string, date: Date = new Date()): string {
  switch (period) {
    case "daily":
      return date.toISOString().slice(0, 10);
    case "weekly": {
      const d = new Date(
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
      );
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil(
        ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
      );
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
    }
    case "custom": {
      const start = process.env.BUDGET_START_DATE;
      const end = process.env.BUDGET_END_DATE;
      if (start && end) return `${start}_${end}`;
      return date.toISOString().slice(0, 7);
    }
    default:
      return date.toISOString().slice(0, 7);
  }
}
