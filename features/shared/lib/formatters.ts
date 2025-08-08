// utils/formatters.ts
export function formatCurrency(value: number | null | undefined): string {
  if (value === undefined || value === null) return "-";
  return `$${value.toFixed(2)}`;
}
