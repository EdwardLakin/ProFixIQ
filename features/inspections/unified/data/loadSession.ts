import type { InspectionSession } from "@inspections/lib/inspection/types";

export async function loadInspectionSession(
  lineId: string,
): Promise<InspectionSession | null> {
  console.debug("loadInspectionSession (stub)", lineId);
  return null;
}
