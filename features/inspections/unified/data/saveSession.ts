import type { InspectionSession } from "@inspections/lib/inspection/types";

export async function saveInspectionSessionUnified(
  session: InspectionSession,
): Promise<void> {
  console.debug("saveInspectionSessionUnified (stub)", session.id);
}
