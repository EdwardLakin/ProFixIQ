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
    templateId?: string | string[];
  }>;
}) {
  const requestedParams = await searchParams;
  const requested = requestedParams.status;
  const status =
    typeof requested === "string" && SUPPORTED_STATUSES.has(requested)
      ? requested
      : "";
  const readyToInvoiceCloseout =
    status === "ready_to_invoice" && requestedParams.mode === "field_closeout";
  const inspectionTemplateId =
    typeof requestedParams.templateId === "string"
      ? requestedParams.templateId.trim() || null
      : null;

  return (
    <MobileWorkOrderQueue
      key={`${status || "active"}:${readyToInvoiceCloseout ? "closeout" : "detail"}`}
      initialStatus={status}
      readyToInvoiceCloseout={readyToInvoiceCloseout}
      inspectionTemplateId={inspectionTemplateId}
    />
  );
}
