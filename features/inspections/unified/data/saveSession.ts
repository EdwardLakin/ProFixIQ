import type { InspectionSession } from "@inspections/lib/inspection/types";

/**
 * Persist the current unified session via the unified API route.
 */
export async function saveInspectionSessionUnified(
  session: InspectionSession,
): Promise<void> {
  const lineId =
    session.id || session.workOrderId || `local-${session.templateId ?? "unknown"}`;

  await fetch(`/api/inspections/unified/session/${encodeURIComponent(lineId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session }),
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.debug("saveInspectionSessionUnified error", err);
  });
}
