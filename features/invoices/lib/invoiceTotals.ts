export type InvoiceTotalsInput = {
  laborCost: number;
  partsCost: number;
  shopSuppliesTotal?: number | null;
  discountTotal?: number | null;
  taxRatePercent?: number | null;
};

export type CalculatedInvoiceTotals = {
  laborCost: number;
  partsCost: number;
  shopSuppliesTotal: number;
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  taxRatePercent: number;
  taxTotal: number;
  total: number;
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nonNegative(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function calculateInvoiceTotals(
  input: InvoiceTotalsInput,
): CalculatedInvoiceTotals {
  const laborCost = roundMoney(nonNegative(input.laborCost));
  const partsCost = roundMoney(nonNegative(input.partsCost));
  const shopSuppliesTotal = roundMoney(nonNegative(input.shopSuppliesTotal));
  const discountTotal = roundMoney(nonNegative(input.discountTotal));
  const taxRatePercent = nonNegative(input.taxRatePercent);
  const subtotal = roundMoney(laborCost + partsCost + shopSuppliesTotal);
  const taxableTotal = roundMoney(Math.max(0, subtotal - discountTotal));
  const taxTotal = roundMoney(taxableTotal * (taxRatePercent / 100));
  const total = roundMoney(taxableTotal + taxTotal);

  return {
    laborCost,
    partsCost,
    shopSuppliesTotal,
    subtotal,
    discountTotal,
    taxableTotal,
    taxRatePercent,
    taxTotal,
    total,
  };
}
