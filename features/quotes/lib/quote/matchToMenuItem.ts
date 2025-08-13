import type { InspectionItem } from "@inspections/lib/inspection/types";
import { serviceMenu } from "@shared/lib/menuItems";
import { generateLaborTimeEstimate } from "@ai/lib/ai/generateLaborTimeEstimate";

/** Shape expected by QuoteViewer (summary page) */
export interface QuoteLine {
  description: string;
  hours: number;
  rate: number;
  total: number;
  job_type: "repair" | "maintenance";
}

/** Narrower filter to satisfy TS when collapsing optional strings */
const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

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
  }

  const summary = [
    "Completed Vehicle Inspection.",
    failed.length > 0 ? `⚠️ Failed Items:\n` : undefined,
    ...failed.map(
      (item) => `- ${item.item}: ${item.notes || ""} *Requires attention*`,
    ),
    recommended.length > 0 ? `\n🟠 Recommended Items:\n` : undefined,
    ...recommended.map(
      (item) => `- ${item.item}: ${item.notes || ""} *Suggested repair*`,
    ),
  ]
    .filter(isNonEmptyString)
    .join("\n");

  const quote: QuoteLine[] = [];
  const RATE = 120;

  for (const itm of [...failed, ...recommended]) {
    const term = String(itm.item ?? itm.name ?? "");

    // 1) Try to match a known service menu item
    const menuMatch = serviceMenu.find((m) =>
      term.toLowerCase().includes(m.name.toLowerCase()),
    );

    if (menuMatch) {
      const hours = menuMatch.laborHours ?? 1;
      const partsCost = menuMatch.partCost ?? 0;
      const total = Number((hours * RATE + partsCost).toFixed(2));

      quote.push({
        description: menuMatch.name,
        hours,
        rate: RATE,
        total,
        job_type: "repair",
      });
      continue;
    }

    // 2) Fall back to AI labor estimate
    const labor = await generateLaborTimeEstimate(term, "repair");
    if (typeof labor === "number" && labor > 0) {
      quote.push({
        description: term,
        hours: labor,
        rate: RATE,
        total: Number((labor * RATE).toFixed(2)),
        job_type: "repair",
      });
    }
  }

  return { summary, quote };
}