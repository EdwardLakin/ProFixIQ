function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const HIDDEN_QUOTE_REVISION_STATUSES = new Set([
  "cancelled",
  "rejected",
  "superseded",
]);

const CUSTOMER_VISIBLE_QUOTE_STATUSES = new Set([
  "sent",
  "approved",
  "converted",
  "declined",
  "deferred",
]);

const CUSTOMER_VISIBLE_QUOTE_STAGES = new Set([
  "sent",
  "customer_review",
  "customer_approved",
  "customer_declined",
  "customer_deferred",
]);

const TERMINAL_QUOTE_STATUSES = new Set([
  "approved",
  "converted",
  "declined",
  "deferred",
  ...HIDDEN_QUOTE_REVISION_STATUSES,
]);

export function isHiddenQuoteRevision(row: Record<string, unknown>): boolean {
  const status = (text(row.status) ?? "").trim().toLowerCase();
  return HIDDEN_QUOTE_REVISION_STATUSES.has(status);
}

export function isCustomerVisibleQuoteLine(
  row: Record<string, unknown>,
): boolean {
  if (isHiddenQuoteRevision(row)) return false;

  const status = (text(row.status) ?? "").trim().toLowerCase();
  const stage = (text(row.stage) ?? "").trim().toLowerCase();
  return (
    Boolean(
      text(row.sent_to_customer_at) ||
      text(row.approved_at) ||
      text(row.declined_at) ||
      text(row.work_order_line_id),
    ) ||
    CUSTOMER_VISIBLE_QUOTE_STATUSES.has(status) ||
    CUSTOMER_VISIBLE_QUOTE_STAGES.has(stage)
  );
}

export function isPendingCustomerQuoteLine(
  row: Record<string, unknown>,
): boolean {
  const status = (text(row.status) ?? "").trim().toLowerCase();
  const stage = (text(row.stage) ?? "").trim().toLowerCase();

  if (
    TERMINAL_QUOTE_STATUSES.has(status) ||
    text(row.approved_at) ||
    text(row.declined_at) ||
    text(row.work_order_line_id)
  ) {
    return false;
  }

  return (
    isCustomerVisibleQuoteLine(row) &&
    (Boolean(text(row.sent_to_customer_at)) ||
      status === "sent" ||
      stage === "sent" ||
      stage === "customer_review")
  );
}

export function isCustomerVisibleDirectWorkOrderLine(
  row: Record<string, unknown>,
): boolean {
  if (text(row.voided_at)) return false;

  const status = (text(row.status) ?? "").trim().toLowerCase();
  const lineStatus = (text(row.line_status) ?? "").trim().toLowerCase();
  const approvalState = (text(row.approval_state) ?? "").trim().toLowerCase();

  return (
    (approvalState === "pending" && status === "awaiting_approval") ||
    approvalState === "approved" ||
    approvalState === "declined" ||
    approvalState === "deferred" ||
    lineStatus === "authorized" ||
    Boolean(text(row.approval_at)) ||
    ["completed", "ready_to_invoice", "invoiced"].includes(status)
  );
}

export function quoteLineTotal(row: Record<string, unknown>): number {
  return (
    number(row.grand_total) ??
    number(row.subtotal) ??
    (number(row.labor_total) ?? 0) + (number(row.parts_total) ?? 0)
  );
}
