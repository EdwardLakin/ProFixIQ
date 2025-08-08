import { QuoteLineItem } from "@shared/lib/inspection/types";
import { QuoteLine } from "./generateQuoteFromInspection";
import { inferPartName } from "@shared/lib/ai/inferPartName";

/**
 * Normalize a QuoteLine into a QuoteLineItem with inferred part info.
 */
export async function normalizeQuoteLine(
  quote: QuoteLine,
): Promise<QuoteLineItem> {
  let partName: string | null = null;

  try {
    // Try to infer part name using AI based on the description
    partName = await inferPartName(quote.description);
  } catch (err) {
    console.warn("AI inference failed:", err);
  }

  const fallbackPartName = quote.description.toLowerCase().includes("brake")
    ? "Brake Pad"
    : quote.description.toLowerCase().includes("oil")
      ? "Oil Filter"
      : quote.description.toLowerCase().includes("battery")
        ? "Battery"
        : "General Replacement Part";

  const name = partName?.trim() || fallbackPartName;

  return {
    id: crypto.randomUUID(), // ✅ Required unique ID
    item: quote.description,
    name: quote.description,
    description: quote.description,
    status: "fail", // Default; override if needed
    price: quote.total,
    partName: name,
    partPrice: 0,
    part: {
      name,
      price: 0,
    },
    laborHours: quote.hours,
    photoUrls: [],
    notes: "",
  };
}
