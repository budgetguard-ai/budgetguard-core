/**
 * Shared utility function for formatting currency values consistently across the application
 */
export const formatCurrency = (amount: string | number): string => {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
