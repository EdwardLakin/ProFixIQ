import { InspectionState } from "../inspection/types";
import { matchToMenuItem } from "./matchToMenuItem";
import { QuoteMenuItem } from "./quoteMenu";
import { userSettings } from "../config/userSettings";

interface QuoteLine {
  description: string;
  parts: { name: string; price: number }[];
  laborHours: number;
  laborCost: number;
  shopSupplies: number;
  total: number;
  category: "diagnose" | "repair" | "maintenance";
}

export function generateQuoteFromInspection(state: InspectionState): QuoteLine[] {
  const results: QuoteLine[] = [];

  for (const [section, items] of Object.entries(state.sections)) {
    for (const [item, details] of Object.entries(items)) {
      if (details.status === "fail" || details.status === "attention") {
        const combinedText = `${section} ${item} ${details.notes?.join(" ") || ""}`.toLowerCase();
        const match: QuoteMenuItem | null = matchToMenuItem(combinedText);

        if (match) {
          const laborCost = match.laborHours * userSettings.laborRate;
          const parts = match.parts.map((p) => ({
            name: p.name,
            price: p.cost * userSettings.partsMarkup,
          }));
          const partsTotal = parts.reduce((sum, p) => sum + p.price, 0);
          const total = laborCost + partsTotal + userSettings.shopSuppliesFlatFee;

          results.push({
            description: match.triggerPhrases[0],
            parts,
            laborHours: match.laborHours,
            laborCost,
            shopSupplies: userSettings.shopSuppliesFlatFee,
            total,
            category: match.category,
          });
        }
      }
    }
  }

  return results;
}