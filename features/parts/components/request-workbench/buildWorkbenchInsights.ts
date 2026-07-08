import type { SmartInsight } from "./types";

export function buildWorkbenchInsights(input: {
  hasSuggestedMatch?: boolean;
  noStock?: boolean;
  possibleMismatch?: string | null;
  onPo?: boolean;
  partial?: boolean;
  noPreferredSupplier?: boolean;
}): SmartInsight[] {
  const insights: SmartInsight[] = [];

  if (input.hasSuggestedMatch) {
    insights.push({
      id: "suggested-match",
      kind: "suggested_match",
      label: "Suggested match",
      detail: "Deterministic inventory matching found a likely part.",
    });
  }

  if (input.noStock) {
    insights.push({
      id: "no-stock",
      kind: "no_stock",
      label: "No stock",
      detail: "Matched inventory part has no available on-hand quantity.",
    });
  }

  if (input.possibleMismatch) {
    insights.push({
      id: "possible-mismatch",
      kind: "possible_mismatch",
      label: "Possible mismatch",
      detail: input.possibleMismatch,
    });
  }

  if (input.onPo) {
    insights.push({
      id: "on-po",
      kind: "on_po",
      label: "On PO",
      detail: "This row is already linked to a purchase order.",
    });
  }

  if (input.partial) {
    insights.push({
      id: "partial",
      kind: "partial",
      label: "Partial",
      detail: "Some quantity has been received, but the item is not complete.",
    });
  }

  if (input.noPreferredSupplier) {
    insights.push({
      id: "no-preferred-supplier",
      kind: "no_preferred_supplier",
      label: "No preferred supplier",
      detail: "No deterministic supplier suggestion is available for this row.",
    });
  }

  return insights;
}
