import { matchToMenuItem } from "./matchToMenuItem";
import { InspectionItem } from "@inspections/lib/inspection/types";
import { generateLaborTimeEstimate } from "@ai/lib/ai/generateLaborTimeEstimate";

export interface QuoteLine {
  description: string;
  hours: number;
  rate: number;
  total: number;
  job_type: string;
}

/**
 * Generate a quote and summary from inspection items
 */
export async function generateQuoteFromInspection(
  results: InspectionItem[],
): Promise<{ summary: string; quote: QuoteLine[] }> {
  const failed: InspectionItem[] = [];
  const recommended: InspectionItem[] = [];

  for (const item of results) {
    const status =
      item.status === "fail" || item.status === "recommend"
        ? item.status
        : "ok";

    if (status === "fail") {
      failed.push({ ...item, status });
    } else if (status === "recommend") {
      recommended.push({ ...item, status });
    }
    // items defaulting to 'ok' are ignored in quote generation
  }

  const summary = [
    "Completed Vehicle Inspection.",
    failed.length > 0 ? `⚠️ Failed Items:\n` : null,
    ...failed.map(
      (item) => `- ${item.item}: ${item.notes || ""} *Requires attention*`,
    ),
    recommended.length > 0 ? `\n🟠 Recommended Items:\n` : null,
    ...recommended.map(
      (item) => `- ${item.item}: ${item.notes || ""} *Suggested repair*`,
    ),
  ]
    .filter(Boolean)
    .join("\n");

  const quote: QuoteLine[] = [];

  for (const item of [...failed, ...recommended]) {
    const matched = matchToMenuItem(item.item, item);

    if (matched) {
      quote.push(matched as QuoteLine);
    } else {
      const labor = await generateLaborTimeEstimate(item.item, "repair");
      if (labor && labor > 0) {
        quote.push({
          description: item.item,
          hours: labor,
          rate: 120,
          total: parseFloat((labor * 120).toFixed(2)),
          job_type: "repair",
        });
      }
    }
  }

  return { summary, quote };
}
