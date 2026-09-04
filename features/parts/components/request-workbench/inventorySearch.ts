import type { PartsRequestInventoryResult } from "./types";

/**
 * Shared inventory search predicate used by both the full Inventory Picker
 * modal and the inline per-field comboboxes on the request workbench rows.
 * Matches by description/name, SKU, part number, or manufacturer.
 */
export function matchesInventoryQuery(
  part: PartsRequestInventoryResult,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [part.label, part.sku, part.partNumber, part.manufacturer]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

export function filterInventoryResultsByQuery(
  results: PartsRequestInventoryResult[],
  query: string,
): PartsRequestInventoryResult[] {
  return results.filter((part) => matchesInventoryQuery(part, query));
}
