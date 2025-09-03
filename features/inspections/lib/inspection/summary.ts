import type { InspectionSession, InspectionItemStatus } from "./types";

export type InspectionSummaryItem = {
  section: string;
  item: string;
  status: InspectionItemStatus;
  notes?: string;
  value?: string | number | null;
  unit?: string | null;
  photoUrls: string[];
};

export function extractSummaryFromSession(
  session: InspectionSession,
): InspectionSummaryItem[] {
  const items: InspectionSummaryItem[] = [];

  for (const section of session.sections) {
    const sectionTitle = section.title ?? "";
    for (const it of section.items) {
      const status: InspectionItemStatus = it.status ?? "ok";
      items.push({
        section: sectionTitle,
        item: it.item ?? it.name ?? "",
        status,
        notes: it.notes ?? undefined,
        value: it.value ?? null,
        unit: it.unit ?? null,
        photoUrls: Array.isArray(it.photoUrls) ? it.photoUrls : [],
      });
    }
  }

  return items;
}