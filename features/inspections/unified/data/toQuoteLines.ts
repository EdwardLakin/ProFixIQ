import type {
  InspectionSession,
  QuoteLineItem,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";

/**
 * Convert a unified inspection session into quote line items.
 *
 * Rules:
 * - Only FAIL / RECOMMEND items (or items with recommendations[]) become lines.
 * - Measurements are folded into notes.
 * - Recommendations go into the AI metadata block.
 */
export function inspectionToQuoteLinesUnified(
  session: InspectionSession,
): QuoteLineItem[] {
  const sections = session.sections ?? [];
  const out: QuoteLineItem[] = [];

  const makeId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `ql-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  sections.forEach((section) => {
    const sectionTitle = section.title ?? "Inspection";

    section.items.forEach((item) => {
      const label = (item.item ?? item.name ?? "").trim();
      const status = (item.status ?? "ok") as InspectionItemStatus;

      const hasRecommendations =
        Array.isArray(item.recommend) && item.recommend.length > 0;

      if (!(status === "fail" || status === "recommend" || hasRecommendations)) {
        return;
      }

      const baseDescription = label || sectionTitle;
      const measurement =
        item.value != null
          ? `${item.value}${item.unit ? ` ${item.unit}` : ""}`
          : null;

      let notes = item.notes ?? item.note ?? "";

      if (measurement) {
        const measurementLine = `Measured: ${measurement}`;
        notes = notes ? `${notes}\n${measurementLine}` : measurementLine;
      }

      const line: QuoteLineItem = {
        id: makeId(),
        description: baseDescription,
        item: label || undefined,
        name: label || undefined,
        status,
        notes: notes || undefined,
        price: 0,
        inspectionItem: label || undefined,
        photoUrls: item.photoUrls ?? [],
        source: "inspection",
      };

      if (hasRecommendations) {
        line.ai = {
          summary: item.recommend!.join("; "),
          parts: [],
        };
      }

      out.push(line);
    });
  });

  return out;
}
