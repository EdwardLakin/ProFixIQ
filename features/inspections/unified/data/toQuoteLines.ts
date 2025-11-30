// features/inspections/unified/data/toQuoteLines.ts
import type {
  InspectionSession,
  InspectionItemStatus,
  QuoteLineItem,
} from "@inspections/lib/inspection/types";

function normaliseStatus(raw: unknown): InspectionItemStatus {
  const v = String(raw ?? "").toLowerCase();
  if (v === "ok" || v === "fail" || v === "na" || v === "recommend") {
    return v as InspectionItemStatus;
  }
  // Default to "ok" if unset/unknown
  return "ok";
}

/**
 * Convert a unified inspection session into quote lines.
 * For now we create a line for each item with FAIL or RECOMMEND.
 */
export function inspectionToQuoteLinesUnified(
  session: InspectionSession,
): QuoteLineItem[] {
  const sections = session.sections ?? [];
  const lines: QuoteLineItem[] = [];

  sections.forEach((section, sectionIndex) => {
    const sectionTitle = section.title ?? `Section ${sectionIndex + 1}`;

    (section.items ?? []).forEach((item, itemIndex) => {
      const status = normaliseStatus(item.status);

      if (status !== "fail" && status !== "recommend") return;

      const label = item.item ?? item.name ?? "Item";

      const measurementBits: string[] = [];
      if (item.value !== undefined && item.value !== null && item.value !== "") {
        measurementBits.push(String(item.value));
      }
      if (item.unit) {
        // QuoteLineItem has `value` but no `unit` field – keep unit in notes/description.
        measurementBits.push(String(item.unit));
      }

      const descriptionParts: string[] = [label, `(${sectionTitle})`];
      if (measurementBits.length) {
        descriptionParts.push(`– ${measurementBits.join(" ")}`);
      }

      const description = descriptionParts.join(" ");

      const baseNotes = item.notes ?? item.note ?? "";
      const measurementNote =
        measurementBits.length && !baseNotes
          ? `Measured ${measurementBits.join(" ")}.`
          : "";
      const notes =
        baseNotes && measurementNote
          ? `${baseNotes} ${measurementNote}`
          : baseNotes || measurementNote || undefined;

      const lineIdSuffix = `${sectionIndex}-${itemIndex}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      const line: QuoteLineItem = {
        id: `${session.id || "session"}:${lineIdSuffix}`,
        description,
        item: label,
        name: label,
        status,
        notes,
        price: 0, // pricing can be filled in later
        value: item.value ?? null,
        photoUrls: item.photoUrls ?? [],
        source: "inspection",
        inspectionItem: label,
      };

      if (item.recommend && item.recommend.length) {
        line.ai = {
          summary: item.recommend.join("; "),
        };
      }

      lines.push(line);
    });
  });

  return lines;
}
