// features/inspections/lib/inspection/onStatusChange.ts
import type { InspectionItem, InspectionItemStatus } from "@inspections/lib/inspection/types";

export function applyStatus(
  item: InspectionItem,
  status: InspectionItemStatus
): InspectionItem {
  const next: InspectionItem = { ...item, status };

  // When not fail/recommend, clear photos/notes (your existing behavior)
  if (status !== "fail" && status !== "recommend") {
    next.photoUrls = [];
    // keep notes if you prefer – or clear:
    // next.notes = "";
  }
  return next;
}

export function needsPhoto(item?: InspectionItem): boolean {
  const s = item?.status;
  return s === "fail" || s === "recommend";
}