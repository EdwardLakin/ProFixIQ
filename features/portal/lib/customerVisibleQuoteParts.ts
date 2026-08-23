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

function sanitizedCustomerPart(value: unknown): Record<string, unknown> | null {
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
    "unitPrice",
    "unit_price",
    "quoted_price",
    "price",
    "totalPrice",
    "total_price",
    "line_total",
    "total",
    "pricing_unavailable",
  ] as const;

  return Object.fromEntries(
    safeKeys.flatMap((key) =>
      item[key] == null ? [] : ([[key, item[key]]] as const),
    ),
  );
}

export function sanitizeCustomerVisibleQuoteMetadata(
  value: unknown,
): Record<string, unknown> {
  const source = record(value) ?? {};
  const safe: Record<string, unknown> = {};

  for (const key of ["request_kind", "fulfillment", "labor_rate"] as const) {
    if (source[key] != null) safe[key] = source[key];
  }

  const photoUrls = metadataArray(source, "photo_urls").filter(
    (url): url is string => typeof url === "string",
  );
  if (photoUrls.length > 0) safe.photo_urls = photoUrls;

  const parts = metadataArray(source, "parts")
    .map(sanitizedCustomerPart)
    .filter((part): part is Record<string, unknown> => part !== null);
  if (parts.length > 0) safe.parts = parts;

  const partsQuote = record(source.parts_quote);
  if (partsQuote) {
    const items = metadataArray(partsQuote, "items")
      .map(sanitizedCustomerPart)
      .filter((part): part is Record<string, unknown> => part !== null);
    const pricingSanitization = record(partsQuote.pricing_sanitization);
    safe.parts_quote = {
      ...(items.length > 0 ? { items } : {}),
      ...(pricingSanitization
        ? {
            pricing_sanitization: {
              ...(pricingSanitization.customer_pricing_quarantined === true
                ? { customer_pricing_quarantined: true }
                : {}),
              ...(pricingSanitization.customer_pricing_remediated === true
                ? { customer_pricing_remediated: true }
                : {}),
            },
          }
        : {}),
    };
  }

  return safe;
}

function sanitizedQuarantinedPart(
  value: unknown,
): Record<string, unknown> | null {
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
    sanitization &&
    typeof sanitization === "object" &&
    !Array.isArray(sanitization)
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
