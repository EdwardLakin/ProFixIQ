// features/inspections/lib/inspection/save.ts
import type { InspectionSession } from "@inspections/lib/inspection/types";

export async function saveInspectionSession(
  session: InspectionSession,
  workOrderLineId: string
): Promise<void> {
  if (!workOrderLineId) {
    throw new Error("Missing workOrderLineId");
  }

  const res = await fetch("/api/inspections/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ workOrderLineId, session }),
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error || "Save failed");
  }
}