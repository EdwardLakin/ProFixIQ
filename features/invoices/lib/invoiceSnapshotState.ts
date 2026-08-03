const FINALIZED_INVOICE_STATUSES = new Set([
  "issued_pending_send",
  "issued",
  "sent",
  "partially_paid",
  "paid",
  "refunded",
  "void",
  "voided",
]);

export function shouldUsePersistedInvoiceTotals(args: {
  workOrderStatus: unknown;
  invoiceStatus: unknown;
}): boolean {
  const workOrderStatus = String(args.workOrderStatus ?? "").trim().toLowerCase();
  const invoiceStatus = String(args.invoiceStatus ?? "").trim().toLowerCase();
  return (
    workOrderStatus === "invoiced" &&
    FINALIZED_INVOICE_STATUSES.has(invoiceStatus)
  );
}
