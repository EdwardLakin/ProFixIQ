function metadataArray(
  metadata: Record<string, unknown>,
  key: string,
): unknown[] {
  const value = metadata[key];
  return Array.isArray(value) ? value : [];
}

export function selectCustomerVisibleQuoteParts(
  metadata: Record<string, unknown>,
  allowCanonicalPartsQuote: boolean,
): unknown[] {
  const requestedParts = metadataArray(metadata, "parts");
  const partsQuote = metadata.parts_quote;
  const partsQuoteRecord =
    partsQuote && typeof partsQuote === "object" && !Array.isArray(partsQuote)
      ? (partsQuote as Record<string, unknown>)
      : null;
  const sanitization = partsQuoteRecord?.pricing_sanitization;
  const sanitizationRecord =
    sanitization && typeof sanitization === "object" && !Array.isArray(sanitization)
      ? (sanitization as Record<string, unknown>)
      : null;

  // A protected decision can retain its finalized top-level total while legacy
  // item pricing is quarantined for staff review. Never coerce those null item
  // prices to a misleading customer-visible $0 or fall back to stale snapshots.
  if (sanitizationRecord?.customer_pricing_quarantined === true) {
    return [];
  }

  const quotedParts = partsQuoteRecord
    ? metadataArray(partsQuoteRecord, "items")
    : [];

  if (allowCanonicalPartsQuote && quotedParts.length > 0) {
    return quotedParts;
  }

  return requestedParts;
}
