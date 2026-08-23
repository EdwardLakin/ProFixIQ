import { canonicalPartQuantity } from "./status-display";

export type QuotePartsRequirementState = "required" | "labor_only" | "unknown";

export type CanonicalQuotePart = {
  id: string | null;
  requestId: string | null;
  description: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  quoteReady: boolean;
  source: Record<string, unknown>;
};

export type CanonicalQuotePartsSnapshot = {
  items: CanonicalQuotePart[];
  requiredCount: number;
  quotedCount: number;
  pendingCount: number;
  partsTotal: number | null;
  hasCanonicalSnapshot: boolean;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number != null && number >= 0 ? number : null;
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = finiteNumber(value);
  return number != null && number >= 0 ? Math.floor(number) : fallback;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function canonicalQuotePartQuantity(value: {
  qty?: unknown;
  quantity?: unknown;
  qty_requested?: unknown;
  qty_approved?: unknown;
}): number {
  return Math.max(
    canonicalPartQuantity({
      qty: value.qty,
      qtyRequested: value.qty_requested,
      qtyApproved: value.qty_approved,
    }),
    canonicalPartQuantity({ qty: value.quantity }),
  );
}

function parseQuotePart(value: unknown): CanonicalQuotePart | null {
  const source = record(value);
  if (!source) return null;
  const description =
    safeString(source.description) ||
    safeString(source.name) ||
    safeString(source.selected_name) ||
    safeString(source.part_name);
  const quantity = canonicalQuotePartQuantity(source);
  if (!description || quantity <= 0) return null;
  const unitPrice =
    nonNegativeNumber(source.unit_price) ??
    nonNegativeNumber(source.unitPrice) ??
    nonNegativeNumber(source.quoted_price) ??
    nonNegativeNumber(source.price);
  const lineTotal =
    nonNegativeNumber(source.line_total) ??
    nonNegativeNumber(source.total_price) ??
    nonNegativeNumber(source.totalPrice) ??
    (unitPrice == null ? null : Math.round(quantity * unitPrice * 100) / 100);
  const quoteReady =
    source.quote_ready === true ||
    (source.quote_ready !== false && unitPrice != null);

  return {
    id: safeString(source.id) || null,
    requestId: safeString(source.request_id) || null,
    description,
    quantity,
    unitPrice,
    lineTotal,
    quoteReady,
    source,
  };
}

export function readCanonicalQuotePartsSnapshot(
  metadata: unknown,
): CanonicalQuotePartsSnapshot {
  const source = record(metadata) ?? {};
  const partsQuote = record(source.parts_quote);
  const rawItems = Array.isArray(partsQuote?.items) ? partsQuote.items : [];
  const items = rawItems
    .map(parseQuotePart)
    .filter((item): item is CanonicalQuotePart => item !== null);
  const quotedCount = positiveInteger(
    partsQuote?.quoted_count,
    items.filter((item) => item.quoteReady).length,
  );
  const requiredCount = positiveInteger(
    partsQuote?.required_count,
    items.length,
  );
  const pendingCount = positiveInteger(
    partsQuote?.pending_count,
    Math.max(requiredCount - quotedCount, 0),
  );
  const derivedTotal = items.every((item) => item.lineTotal != null)
    ? items.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0)
    : null;

  return {
    items,
    requiredCount,
    quotedCount,
    pendingCount,
    partsTotal: nonNegativeNumber(partsQuote?.parts_total) ?? derivedTotal,
    hasCanonicalSnapshot: partsQuote !== null,
  };
}

export function resolveQuotePartsRequirement(input: {
  metadata: unknown;
  linkedRequestCount?: number;
}): {
  state: QuotePartsRequirementState;
  displayCount: number;
  snapshot: CanonicalQuotePartsSnapshot;
} {
  const metadata = record(input.metadata) ?? {};
  const snapshot = readCanonicalQuotePartsSnapshot(metadata);
  const legacyParts = Array.isArray(metadata.parts) ? metadata.parts : [];
  const linkedRequestCount = Math.max(input.linkedRequestCount ?? 0, 0);
  const displayCount = Math.max(
    snapshot.requiredCount,
    snapshot.items.length,
    legacyParts.length,
    linkedRequestCount,
  );
  if (
    displayCount > 0 ||
    metadata.parts_required === true ||
    snapshot.partsTotal != null && snapshot.partsTotal > 0
  ) {
    return { state: "required", displayCount, snapshot };
  }
  if (
    metadata.no_parts_required === true ||
    metadata.parts_required === false
  ) {
    return { state: "labor_only", displayCount: 0, snapshot };
  }
  return { state: "unknown", displayCount: 0, snapshot };
}
