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
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const requested = (await searchParams).status;
  const status =
    typeof requested === "string" && SUPPORTED_STATUSES.has(requested)
      ? requested
      : "";

  return <MobileWorkOrderQueue initialStatus={status} />;
}
