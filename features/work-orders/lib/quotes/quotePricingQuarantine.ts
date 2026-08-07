export const QUOTE_PRICING_QUARANTINED_CODE =
  "QUOTE_PRICING_QUARANTINED" as const;

export const QUOTE_PRICING_QUARANTINED_MESSAGE =
  "This quote has protected customer pricing that requires manual review. It cannot be sent or decided until the shop resolves the pricing quarantine.";

export function isQuotePricingQuarantineError(value: unknown): boolean {
  const message = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (
    message.includes(QUOTE_PRICING_QUARANTINED_CODE.toLowerCase()) ||
    message.includes("pricing quarantine")
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isQuoteCustomerPricingQuarantined(
  metadata: unknown,
): boolean {
  const metadataRecord = record(metadata);
  const partsQuote = record(metadataRecord?.parts_quote);
  const sanitization = record(partsQuote?.pricing_sanitization);

  return sanitization?.customer_pricing_quarantined === true;
}
