import type { InspectionSession, InspectionItemStatus } from "./types";

export type InspectionSummaryItem = {
  section: string;
  item: string;
  status: InspectionItemStatus;
  note?: string;
  value?: string | number | null;
  unit?: string;
  photoUrls?: string[];
};

export function extractSummaryFromSession(
  session: InspectionSession,
): InspectionSummaryItem[] {
  const items: InspectionSummaryItem[] = [];

  for (const section of session.sections) {
    for (const item of section.items) {
      items.push({
        section: section.title,
        item: item.name,
        status: item.status ?? "ok",
        note: item.notes,
        value: item.value ?? null,
        unit: item.unit,
        photoUrls: item.photoUrls ?? [],
      });
    }
  }

  return items;
}
