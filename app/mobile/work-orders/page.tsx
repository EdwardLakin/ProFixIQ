import MobileWorkOrderQueue from "@/features/mobile/work-orders/MobileWorkOrderQueue";

const SUPPORTED_STATUSES = new Set([
  "queued",
  "in_progress",
  "on_hold",
  "awaiting_approval",
  "completed",
  "ready_to_invoice",
  "invoiced",
]);

export default async function MobileWorkOrdersListPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    mode?: string | string[];
  }>;
}) {
  const requestedParams = await searchParams;
  const requested = requestedParams.status;
  const status =
    typeof requested === "string" && SUPPORTED_STATUSES.has(requested)
      ? requested
      : "";
  const readyToInvoiceCloseout =
    status === "ready_to_invoice" &&
    requestedParams.mode === "field_closeout";

  return (
    <MobileWorkOrderQueue
      key={`${status || "active"}:${readyToInvoiceCloseout ? "closeout" : "detail"}`}
      initialStatus={status}
      readyToInvoiceCloseout={readyToInvoiceCloseout}
    />
  );
}
