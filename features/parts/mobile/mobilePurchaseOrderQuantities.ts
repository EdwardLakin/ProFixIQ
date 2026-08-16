type RequestQuantitySnapshot = {
  qty?: number | null;
  qty_requested?: number | null;
  qty_approved?: number | null;
  qty_ordered?: number | null;
};

type PurchaseOrderLineQuantitySnapshot = {
  qty?: number | null;
  cancelled_qty?: number | null;
  received_qty?: number | null;
};

const RECEIVABLE_PURCHASE_ORDER_STATUSES = new Set([
  "open",
  "ordered",
  "sent",
  "receiving",
  "partially_received",
]);

function finiteQuantity(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function requestTargetQuantity(item: RequestQuantitySnapshot): number {
  return Math.max(
    finiteQuantity(item.qty),
    finiteQuantity(item.qty_requested),
    finiteQuantity(item.qty_approved),
  );
}

export function requestRemainingToOrder(item: RequestQuantitySnapshot): number {
  return Math.max(
    0,
    requestTargetQuantity(item) - finiteQuantity(item.qty_ordered),
  );
}

export function purchaseOrderLineRemaining(
  line: PurchaseOrderLineQuantitySnapshot,
): number {
  const activeOrdered = Math.max(
    0,
    finiteQuantity(line.qty) - finiteQuantity(line.cancelled_qty),
  );
  return Math.max(0, activeOrdered - finiteQuantity(line.received_qty));
}

export function purchaseOrderCanReceive(
  status: string | null | undefined,
): boolean {
  return RECEIVABLE_PURCHASE_ORDER_STATUSES.has(
    typeof status === "string" ? status.trim().toLowerCase() : "",
  );
}
