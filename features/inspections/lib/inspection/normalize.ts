// features/inspections/lib/inspection/normalize.ts
import type { InspectionCategory, InspectionItem } from "./masterInspectionList";

/**
 * Normalize unknown API/DB payloads into a clean InspectionCategory[].
 */
export function toInspectionCategories(input: unknown): InspectionCategory[] {
  if (!Array.isArray(input)) return [];

  return input.map((sec): InspectionCategory => {
    const section = sec as Partial<InspectionCategory>;
    const title: string = typeof section.title === "string" ? section.title : "Section";

    const rawItems = Array.isArray(section.items) ? section.items : [];
    const items: InspectionItem[] = rawItems
      .map((it) => {
        if (typeof (it as any)?.item === "string") {
          return { item: (it as { item: string }).item };
        }
        if (typeof it === "string") {
          return { item: it };
        }
        return null;
      })
      .filter((b): b is InspectionItem => Boolean(b));

    return { title, items };
  });
}