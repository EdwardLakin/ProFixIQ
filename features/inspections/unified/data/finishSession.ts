import type { InspectionSession } from "@inspections/lib/inspection/types";

export async function finishInspectionSessionUnified(
  session: InspectionSession,
): Promise<void> {
  console.debug("finishInspectionSessionUnified (stub)", session.id);
}
