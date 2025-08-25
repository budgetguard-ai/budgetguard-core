/**
 * Shared utility function for formatting currency values consistently across the application
 */
export const formatCurrency = (
  amount: string | number,
  minDecimals = 2,
  maxDecimals = 4,
): string => {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;

  // For very small amounts, show more decimal places
  if (Math.abs(value) > 0 && Math.abs(value) < 0.01) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: 6, // Show up to 6 decimal places for very small amounts
    }).format(value);
  }

  // For normal amounts, use specified decimal places
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(value);
};
