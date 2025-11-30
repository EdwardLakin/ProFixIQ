import type { InspectionSession } from "@inspections/lib/inspection/types";

/**
 * Mark a unified inspection session as finished.
 * Calls the /finish API route; that route can later write DB rows.
 */
export async function finishInspectionSessionUnified(
  session: InspectionSession,
): Promise<void> {
  const lineId =
    session.id || session.workOrderId || `local-${session.templateId ?? "unknown"}`;

  await fetch(
    `/api/inspections/unified/session/${encodeURIComponent(lineId)}/finish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session }),
    },
  ).catch((err) => {
    // eslint-disable-next-line no-console
    console.debug("finishInspectionSessionUnified error", err);
  });
}
