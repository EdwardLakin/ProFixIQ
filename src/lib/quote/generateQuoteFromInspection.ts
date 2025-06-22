import { matchToMenuItem } from "./matchToMenuItem";
import { QuoteLineItem, InspectionResultItem } from "./types";

export function generateQuoteFromInspection(results: InspectionResultItem[]): {
  summary: string;
  quote: QuoteLineItem[];
} {
  const failed = results.filter((r) => r.status === "fail");
  const recommended = results.filter((r) => r.status === "recommend");

  const summary = [
    `Completed Vehicle Inspection.`,
    failed.length ? `⚠️ Failed Items:` : null,
    ...failed.map((item) => `- ${item.name}: ${item.notes || "Requires attention"}`),
    recommended.length ? `🛠️ Recommended Items:` : null,
    ...recommended.map((item) => `- ${item.name}: ${item.notes || "Suggested repair"}`),
  ]
    .filter(Boolean)
    .join("\n");

  const quote: QuoteLineItem[] = [];

  for (const item of [...failed, ...recommended]) {
    const matched = matchToMenuItem(item.name, item.notes || "");

    if (matched) {
      quote.push({
        part: matched.part,
        laborHours: matched.laborHours,
        description: matched.description,
        price: matched.price,
        type: item.status === "fail" ? "repair" : "recommend",
      });
    }
  }

  return { summary, quote };
}