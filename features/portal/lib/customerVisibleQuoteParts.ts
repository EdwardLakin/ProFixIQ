function metadataArray(
  metadata: Record<string, unknown>,
  key: string,
): unknown[] {
  const value = metadata[key];
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizedQuarantinedPart(value: unknown): Record<string, unknown> | null {
  const item = record(value);
  if (!item) return null;

  const safeKeys = [
    "id",
    "request_id",
    "description",
    "name",
    "selected_name",
    "qty",
    "quantity",
    "part_number",
    "partNumber",
    "requested_part_number",
    "sku",
    "manufacturer",
    "supplier",
    "vendor",
  ] as const;
  const safe = Object.fromEntries(
    safeKeys.flatMap((key) =>
      item[key] == null ? [] : ([[key, item[key]]] as const),
    ),
  );
  return {
    ...safe,
    unit_price: null,
    line_total: null,
    pricing_unavailable: true,
  };
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

  const quotedParts = partsQuoteRecord
    ? metadataArray(partsQuoteRecord, "items")
    : [];

  // Keep the finalized descriptions and quantities visible, but rebuild every
  // item from a strict non-price allowlist. This cannot leak the legacy price
  // that caused quarantine and lets the portal say pricing is unavailable
  // instead of presenting a contradictory zero-item quote.
  if (sanitizationRecord?.customer_pricing_quarantined === true) {
    const source = quotedParts.length > 0 ? quotedParts : requestedParts;
    return source
      .map(sanitizedQuarantinedPart)
      .filter((part): part is Record<string, unknown> => part !== null);
  }

  if (
    (allowCanonicalPartsQuote ||
      sanitizationRecord?.customer_pricing_remediated === true) &&
    quotedParts.length > 0
  ) {
    return quotedParts;
  }

  return requestedParts;
}
