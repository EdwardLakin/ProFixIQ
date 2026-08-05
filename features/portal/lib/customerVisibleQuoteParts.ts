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
  const quotedParts =
    partsQuote && typeof partsQuote === "object" && !Array.isArray(partsQuote)
      ? metadataArray(partsQuote as Record<string, unknown>, "items")
      : [];

  if (allowCanonicalPartsQuote && quotedParts.length > 0) {
    return quotedParts;
  }

  return requestedParts;
}
