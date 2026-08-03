function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isPendingCustomerQuoteLine(
  row: Record<string, unknown>,
): boolean {
  const status = (text(row.status) ?? "").trim().toLowerCase();
  const stage = (text(row.stage) ?? "").trim().toLowerCase();
  const terminalStatuses = new Set([
    "approved",
    "converted",
    "declined",
    "deferred",
    "rejected",
    "cancelled",
    "superseded",
  ]);

  if (
    terminalStatuses.has(status) ||
    text(row.approved_at) ||
    text(row.declined_at) ||
    text(row.work_order_line_id)
  ) {
    return false;
  }

  return (
    Boolean(text(row.sent_to_customer_at)) ||
    status === "sent" ||
    stage === "sent" ||
    stage === "customer_review"
  );
}

export function quoteLineTotal(row: Record<string, unknown>): number {
  return (
    number(row.grand_total) ??
    number(row.subtotal) ??
    (number(row.labor_total) ?? 0) + (number(row.parts_total) ?? 0)
  );
}
