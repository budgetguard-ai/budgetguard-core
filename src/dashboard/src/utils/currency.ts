/**
 * Shared utility function for formatting currency values consistently across the application
 */
export const formatCurrency = (amount: string | number): string => {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;

  // For very small amounts, show more decimal places
  if (Math.abs(value) > 0 && Math.abs(value) < 0.01) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 6, // Show up to 6 decimal places for small amounts
    }).format(value);
  }

  // For normal amounts, use 2 decimal places
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
