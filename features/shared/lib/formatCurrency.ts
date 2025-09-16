// features/shared/lib/formatCurrency.ts

/**
 * Format a number as localized currency.
 *
 * @param value - The numeric value (example: 1234.5)
 * @param locale - Locale string (default: "en-US")
 * @param currency - ISO currency code (default: "USD")
 * @returns A formatted string (example: "$1,234.50")
 */
export function formatCurrency(
  value: number,
  locale: string = "en-US",
  currency: string = "USD"
): string {
  if (typeof value !== "number" || isNaN(value)) return "";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}