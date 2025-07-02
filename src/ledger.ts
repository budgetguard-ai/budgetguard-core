export const ALLOWED_PERIODS = ["daily", "monthly", "custom"] as const;
export type Period = (typeof ALLOWED_PERIODS)[number];

export function getBudgetPeriods(): Period[] {
  const raw =
    process.env.BUDGET_PERIODS || process.env.BUDGET_PERIOD || "monthly";
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is Period => ALLOWED_PERIODS.includes(p as Period));
}

export function ledgerKey(
  period: Period,
  date: Date = new Date(),
  window?: { startDate: Date; endDate: Date },
): string {
  switch (period) {
    case "daily":
      return date.toISOString().slice(0, 10);
    case "monthly":
      return date.toISOString().slice(0, 7);
    case "custom":
      if (window) {
        const s = window.startDate.toISOString().slice(0, 10);
        const e = window.endDate.toISOString().slice(0, 10);
        return `${s}_${e}`;
      }
      if (process.env.BUDGET_START_DATE && process.env.BUDGET_END_DATE) {
        return `${process.env.BUDGET_START_DATE}_${process.env.BUDGET_END_DATE}`;
      }
      return date.toISOString().slice(0, 7);
    default:
      return date.toISOString().slice(0, 7);
  }
}
