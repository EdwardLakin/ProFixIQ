import type { Database, Json } from "@shared/types/types/supabase";
import { canonicalQuotePartQuantity } from "@/features/parts/lib/quote-parts-contract";

type DB = Database;
export type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
export type PartRequest = DB["public"]["Tables"]["part_requests"]["Row"];
export type PartRequestItem = DB["public"]["Tables"]["part_request_items"]["Row"];
export type CatalogPart = Pick<
  DB["public"]["Tables"]["parts"]["Row"],
  "id" | "name" | "sku" | "part_number" | "supplier"
> &
  Partial<
    Pick<
      DB["public"]["Tables"]["parts"]["Row"],
      "cost" | "default_cost" | "price" | "default_price"
    >
  >;

export type ResolvedQuotePartSource = "live_request_item" | "synced_metadata" | "technician_snapshot";
export type ResolvedQuotePartPricingState = "unresolved" | "priced";

export type ResolvedQuotePart = {
  requestItemId: string | null;
  requestId: string | null;
  description: string;
  quantity: number;
  requestedPartNumber: string | null;
  selectedPartId: string | null;
  selectedPartNumber: string | null;
  selectedPartName: string | null;
  manufacturer: string | null;
  supplier: string | null;
  vendor: string | null;
  unitCost: number | null;
  unitSellPrice: number | null;
  costLineTotal: number | null;
  sellLineTotal: number | null;
  sellPriceIsSuggestion: boolean;
  status: string | null;
  pricingState: ResolvedQuotePartPricingState;
  source: ResolvedQuotePartSource;
};

export type QuoteLinePartsInput = {
  line: Pick<QuoteLine, "id" | "metadata">;
  liveItems?: PartRequestItem[];
  requests?: PartRequest[];
  selectedParts?: Map<string, CatalogPart>;
};

export type QuoteLinePartsDisclosureState =
  | "details"
  | "collapsed"
  | "unavailable"
  | "none";

export function resolveQuoteLinePartsDisclosure(input: {
  resolvedCount: number;
  requiredCount: number;
  expanded: boolean;
}): QuoteLinePartsDisclosureState {
  if (input.resolvedCount > 0) {
    return input.expanded ? "details" : "collapsed";
  }

  return input.requiredCount > 0 ? "unavailable" : "none";
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function nonNegativeNumber(value: unknown): number | null {
  const n = asNumber(value);
  return n != null && n >= 0 ? n : null;
}

function preferredNonNegativeNumber(primary: unknown, fallback: unknown): number | null {
  const preferred = asNumber(primary) ?? asNumber(fallback);
  return preferred != null && preferred >= 0 ? preferred : null;
}

function metadataRecord(metadata: Json | null): Record<string, Json> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata as Record<string, Json>;
}

function recordFromJson(value: Json): Record<string, Json> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : null;
}

function partsQuoteRecord(metadata: Json | null): Record<string, Json> | null {
  return recordFromJson(metadataRecord(metadata).parts_quote ?? null);
}

export function quoteLinePartsPricingSanitization(
  line: Pick<QuoteLine, "metadata">,
): {
  customerPricingQuarantined: boolean;
  manualReviewRequired: boolean;
} {
  const sanitization = recordFromJson(
    partsQuoteRecord(line.metadata)?.pricing_sanitization ?? null,
  );
  return {
    customerPricingQuarantined:
      sanitization?.customer_pricing_quarantined === true,
    manualReviewRequired: sanitization?.manual_review_required === true,
  };
}

export function quoteLinePartsDisplayTotal(input: {
  line: Pick<QuoteLine, "metadata" | "parts_total">;
  fallbackPartsTotal?: unknown;
}): number | null {
  const persistedTotal = nonNegativeNumber(input.line.parts_total);
  const metadataTotal = nonNegativeNumber(
    partsQuoteRecord(input.line.metadata)?.parts_total,
  );
  const { customerPricingQuarantined } =
    quoteLinePartsPricingSanitization(input.line);

  if (customerPricingQuarantined) {
    return persistedTotal;
  }

  return metadataTotal ?? persistedTotal ?? nonNegativeNumber(input.fallbackPartsTotal);
}

function isActivePartsStatus(value: unknown): boolean {
  return ![
    "cancelled",
    "canceled",
    "rejected",
    "declined",
    "voided",
  ].includes(safeString(value).toLowerCase());
}

function lineTotal(quantity: number, unitAmount: number | null): number | null {
  return unitAmount == null
    ? null
    : Math.round((quantity * unitAmount + Number.EPSILON) * 100) / 100;
}

function sameMoney(left: number | null, right: number | null): boolean {
  return left != null && right != null && Math.round(left * 10_000) === Math.round(right * 10_000);
}

function priceState(unitSellPrice: number | null): ResolvedQuotePartPricingState {
  return unitSellPrice != null && unitSellPrice >= 0 ? "priced" : "unresolved";
}

function durableKey(part: Pick<ResolvedQuotePart, "requestItemId" | "requestId" | "description" | "quantity" | "source">): string {
  if (part.requestItemId) return `item:${part.requestItemId}`;
  if (part.requestId && part.description) return `request:${part.requestId}:${part.description.toLowerCase()}:${part.quantity}`;
  return `snapshot:${part.description.toLowerCase()}:${part.quantity}`;
}

function fromLiveItem(item: PartRequestItem, selectedPart: CatalogPart | null): ResolvedQuotePart | null {
  const description = safeString(item.description) || safeString(selectedPart?.name);
  const quantity = canonicalQuotePartQuantity(item);
  if (!description || quantity <= 0) return null;
  const explicitUnitSellPrice = preferredNonNegativeNumber(
    item.quoted_price,
    item.unit_price,
  );
  const catalogUnitSellPrice = preferredNonNegativeNumber(
    selectedPart?.price,
    selectedPart?.default_price,
  );
  const unitSellPrice = explicitUnitSellPrice ?? catalogUnitSellPrice;
  const requestUnitCost = nonNegativeNumber(item.unit_cost);
  const catalogUnitCost = preferredNonNegativeNumber(
    selectedPart?.cost,
    selectedPart?.default_cost,
  );
  const procurementEstablished =
    Boolean(safeString(item.po_id)) ||
    Math.max(
      asNumber(item.qty_ordered) ?? 0,
      asNumber(item.qty_received) ?? 0,
      0,
    ) > 0;
  const requestCostLooksLikeLegacySellMirror =
    !procurementEstablished && sameMoney(requestUnitCost, unitSellPrice);
  const unitCost = requestCostLooksLikeLegacySellMirror
    ? catalogUnitCost
    : requestUnitCost ?? catalogUnitCost;
  return {
    requestItemId: item.id,
    requestId: item.request_id,
    description,
    quantity,
    requestedPartNumber: safeString(item.requested_part_number) || null,
    selectedPartId: safeString(item.part_id) || null,
    selectedPartNumber: safeString(selectedPart?.part_number) || safeString(selectedPart?.sku) || null,
    selectedPartName: safeString(selectedPart?.name) || null,
    manufacturer: safeString(item.requested_manufacturer) || null,
    supplier: safeString(selectedPart?.supplier) || null,
    vendor: safeString(item.vendor) || null,
    unitCost,
    unitSellPrice,
    costLineTotal: lineTotal(quantity, unitCost),
    sellLineTotal: lineTotal(quantity, unitSellPrice),
    sellPriceIsSuggestion: explicitUnitSellPrice == null && catalogUnitSellPrice != null,
    status: safeString(item.status) || null,
    pricingState: priceState(explicitUnitSellPrice),
    source: "live_request_item",
  };
}

function fromSyncedMetadata(item: Record<string, Json>): ResolvedQuotePart | null {
  const description = safeString(item.description);
  const quantity = canonicalQuotePartQuantity(item);
  if (!description || quantity <= 0) return null;
  const unitSellPrice = nonNegativeNumber(item.unit_price);
  const quoteReady =
    typeof item.quote_ready === "boolean"
      ? item.quote_ready && unitSellPrice != null
      : unitSellPrice != null;
  const sellLineTotal =
    nonNegativeNumber(item.line_total) ?? lineTotal(quantity, unitSellPrice);
  return {
    requestItemId: safeString(item.id) || null,
    requestId: safeString(item.request_id) || null,
    description,
    quantity,
    requestedPartNumber: safeString(item.requested_part_number) || null,
    selectedPartId: safeString(item.part_id) || null,
    selectedPartNumber: null,
    selectedPartName: null,
    manufacturer: safeString(item.manufacturer) || null,
    supplier: null,
    vendor: safeString(item.vendor) || null,
    unitCost: null,
    unitSellPrice,
    costLineTotal: null,
    sellLineTotal,
    sellPriceIsSuggestion: unitSellPrice != null && !quoteReady,
    status: safeString(item.status) || null,
    pricingState: priceState(quoteReady ? unitSellPrice : null),
    source: "synced_metadata",
  };
}

function fromTechnicianSnapshot(item: Record<string, Json>): ResolvedQuotePart | null {
  const description = safeString(item.description) || safeString(item.name) || safeString(item.part) || safeString(item.part_name);
  const quantity = canonicalQuotePartQuantity(item);
  if (!description || quantity <= 0) return null;
  const unitCost =
    nonNegativeNumber(item.unitCost) ??
    nonNegativeNumber(item.unit_cost) ??
    nonNegativeNumber(item.cost);
  const unitSellPrice =
    nonNegativeNumber(item.unitSellPrice) ??
    nonNegativeNumber(item.unit_sell_price) ??
    nonNegativeNumber(item.unitPrice) ??
    nonNegativeNumber(item.unit_price) ??
    nonNegativeNumber(item.price);
  return {
    requestItemId: null,
    requestId: null,
    description,
    quantity,
    requestedPartNumber: safeString(item.part_number) || safeString(item.partNumber) || null,
    selectedPartId: null,
    selectedPartNumber: null,
    selectedPartName: null,
    manufacturer: safeString(item.manufacturer) || null,
    supplier: safeString(item.supplier) || null,
    vendor: safeString(item.vendor) || null,
    unitCost,
    unitSellPrice,
    costLineTotal: lineTotal(quantity, unitCost),
    sellLineTotal: lineTotal(quantity, unitSellPrice),
    sellPriceIsSuggestion: false,
    status: null,
    pricingState: priceState(unitSellPrice),
    source: "technician_snapshot",
  };
}

function suppressQuarantinedPricing(part: ResolvedQuotePart): ResolvedQuotePart {
  return {
    ...part,
    unitCost: null,
    unitSellPrice: null,
    costLineTotal: null,
    sellLineTotal: null,
    sellPriceIsSuggestion: false,
    pricingState: "unresolved",
  };
}

export function resolveQuoteLineParts(input: QuoteLinePartsInput): ResolvedQuotePart[] {
  const selectedParts = input.selectedParts ?? new Map<string, CatalogPart>();
  const filterByRequests = input.requests !== undefined;
  const activeRequestIds = new Set(
    (input.requests ?? [])
      .filter(
        (request) =>
          request.quote_line_id === input.line.id && isActivePartsStatus(request.status),
      )
      .map((request) => request.id),
  );
  const live = (input.liveItems ?? [])
    .filter(
      (item) =>
        item.quote_line_id === input.line.id &&
        isActivePartsStatus(item.status) &&
        (!filterByRequests || activeRequestIds.has(item.request_id)),
    )
    .map((item) => fromLiveItem(item, item.part_id ? selectedParts.get(item.part_id) ?? null : null))
    .filter((item): item is ResolvedQuotePart => Boolean(item));

  const result = new Map<string, ResolvedQuotePart>();
  for (const item of live) result.set(durableKey(item), item);

  const metadata = metadataRecord(input.line.metadata);
  if (result.size === 0) {
    const partsQuote = partsQuoteRecord(input.line.metadata);
    const syncedItems = Array.isArray(partsQuote?.items) ? partsQuote.items : [];
    for (const raw of syncedItems) {
      const record = recordFromJson(raw);
      if (!record) continue;
      const item = fromSyncedMetadata(record);
      if (item) result.set(durableKey(item), item);
    }
  }

  if (result.size === 0) {
    const techItems = Array.isArray(metadata.parts) ? metadata.parts : [];
    for (const raw of techItems) {
      const record = recordFromJson(raw);
      if (!record) continue;
      const item = fromTechnicianSnapshot(record);
      if (item) result.set(durableKey(item), item);
    }
  }

  const resolved = [...result.values()];
  return quoteLinePartsPricingSanitization(input.line).customerPricingQuarantined
    ? resolved.map(suppressQuarantinedPricing)
    : resolved;
}

export function quoteLineTotalResolved(input: { persistedGrandTotal: unknown; persistedSubtotal: unknown; calculatedLabor: number; calculatedParts: number }): number {
  const calculated = input.calculatedLabor + input.calculatedParts;
  const grand = asNumber(input.persistedGrandTotal);
  if (grand != null && (grand !== 0 || calculated === 0)) return grand;
  const subtotal = asNumber(input.persistedSubtotal);
  if (subtotal != null && (subtotal !== 0 || calculated === 0)) return subtotal;
  return calculated;
}
