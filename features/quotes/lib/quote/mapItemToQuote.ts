// features/quotes/lib/quote/mapItemToQuote.ts
import type { InspectionItem, QuoteLineItem } from "@inspections/lib/inspection/types";

export function toQuoteLineItem(item: InspectionItem): QuoteLineItem {
  const name = item.item ?? item.name ?? "Inspection Item";
  return {
    id: crypto.randomUUID(),
    item: name,
    name,
    description: item.notes || name,
    status: (item.status ?? "fail"),
    notes: item.notes,
    price: 0,          // let UI or service lookup fill these
    laborHours: 0.5,
    photoUrls: item.photoUrls ?? [],
    part: { name: "", price: 0 },
    partName: "",
    partPrice: null,
  };
}