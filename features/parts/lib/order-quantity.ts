type OrderCoverageInput = {
  qty?: unknown;
  qtyRequested?: unknown;
  qtyApproved?: unknown;
  qtyOrdered?: unknown;
  qtyReceived?: unknown;
  qtyReserved?: unknown;
  qtyConsumed?: unknown;
  qtyReturned?: unknown;
};

export type OrderCoverage = {
  targetQty: number;
  orderedQty: number;
  receivedQty: number;
  stagedQty: number;
  nonPoStockCoverageQty: number;
  remainingToOrderQty: number;
};

function nonnegative(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

/**
 * Returns the quantity that still needs a PO line.
 *
 * Received quantity is already represented by qtyOrdered, while staged stock can
 * come from either that receipt or pre-existing inventory. Only the staged amount
 * above cumulative receipts is treated as non-PO stock coverage. This prevents
 * both double-ordering stocked units and double-counting received units.
 */
export function calculateOrderCoverage(input: OrderCoverageInput): OrderCoverage {
  const targetQty = Math.max(
    nonnegative(input.qtyApproved),
    nonnegative(input.qtyRequested),
    nonnegative(input.qty),
  );
  const orderedQty = nonnegative(input.qtyOrdered);
  const receivedQty = nonnegative(input.qtyReceived);
  const netConsumedQty = Math.max(
    nonnegative(input.qtyConsumed) - nonnegative(input.qtyReturned),
    0,
  );
  const stagedQty = nonnegative(input.qtyReserved) + netConsumedQty;
  const nonPoStockCoverageQty = Math.max(stagedQty - receivedQty, 0);
  const remainingToOrderQty = Math.max(
    targetQty - orderedQty - nonPoStockCoverageQty,
    0,
  );

  return {
    targetQty,
    orderedQty,
    receivedQty,
    stagedQty,
    nonPoStockCoverageQty,
    remainingToOrderQty,
  };
}
