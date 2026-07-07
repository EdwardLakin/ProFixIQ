import type {
  DeterministicStockSuggestion,
  StockMatchReason,
} from "./deterministicStockMatcher";

export type SuggestionDisplay = {
  headline: string;
  matchLabel: string;
  availabilityLabel: string;
  actionLabel: string;
  technicalReasons: string[];
};

function reasonLabel(reason: StockMatchReason): string {
  switch (reason) {
    case "exact sku match":
    case "exact part number match":
    case "vendor SKU match":
    case "alias part number match":
      return "Exact part number match";
    case "exact normalized name match":
      return "Exact name match";
    case "token match":
    case "description match":
      return "Description match";
    case "in stock":
      return "Use inventory";
    case "no stock available":
      return "Order required";
    default:
      return "Likely match";
  }
}

export function getStockSuggestionDisplay(
  suggestion: DeterministicStockSuggestion,
): SuggestionDisplay {
  const hasExactPartNumber = suggestion.reasons.some((reason) =>
    ["exact sku match", "exact part number match", "vendor SKU match", "alias part number match"].includes(reason),
  );
  const matchLabel = hasExactPartNumber
    ? "Exact match"
    : suggestion.confidence === "high"
      ? "Likely match"
      : "No preferred supplier";
  const availabilityLabel = suggestion.qty_available > 0 ? "Use inventory" : "Order required";
  const actionLabel =
    suggestion.recommended_action === "allocate_from_stock"
      ? "Use inventory"
      : suggestion.recommended_action === "order_part"
        ? "Create PO"
        : suggestion.qty_available > 0
          ? "Use inventory"
          : "Create PO";

  return {
    headline: `${matchLabel} · ${availabilityLabel}`,
    matchLabel,
    availabilityLabel,
    actionLabel,
    technicalReasons: Array.from(new Set(suggestion.reasons.map(reasonLabel))),
  };
}
