import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;
export type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
export type PartRequest = DB["public"]["Tables"]["part_requests"]["Row"];
export type PartRequestItem = DB["public"]["Tables"]["part_request_items"]["Row"];
export type CatalogPart = Pick<DB["public"]["Tables"]["parts"]["Row"], "id" | "name" | "sku" | "part_number" | "supplier">;

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
  unitPrice: number | null;
  lineTotal: number | null;
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

function metadataRecord(metadata: Json | null): Record<string, Json> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata as Record<string, Json>;
}

function recordFromJson(value: Json): Record<string, Json> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : null;
}

function quantityFrom(value: unknown, fallback = 1): number {
  const n = asNumber(value);
  return n != null && n > 0 ? n : fallback;
}

function priceState(unitPrice: number | null, lineTotal: number | null): ResolvedQuotePartPricingState {
  return unitPrice != null || lineTotal != null ? "priced" : "unresolved";
}

function durableKey(part: Pick<ResolvedQuotePart, "requestItemId" | "requestId" | "description" | "quantity" | "source">): string {
  if (part.requestItemId) return `item:${part.requestItemId}`;
  if (part.requestId && part.description) return `request:${part.requestId}:${part.description.toLowerCase()}:${part.quantity}`;
  return `snapshot:${part.description.toLowerCase()}:${part.quantity}`;
}

function fromLiveItem(item: PartRequestItem, selectedPart: CatalogPart | null): ResolvedQuotePart | null {
  const description = safeString(item.description) || safeString(selectedPart?.name);
  const quantity = quantityFrom(item.qty, quantityFrom(item.qty_requested, quantityFrom(item.qty_approved, 0)));
  if (!description || quantity <= 0) return null;
  const unitPrice = asNumber(item.quoted_price) ?? asNumber(item.unit_price) ?? asNumber(item.unit_cost);
  const lineTotal = unitPrice == null ? null : Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100;
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
    unitPrice,
    lineTotal,
    status: safeString(item.status) || null,
    pricingState: priceState(unitPrice, lineTotal),
    source: "live_request_item",
  };
}

function fromSyncedMetadata(item: Record<string, Json>): ResolvedQuotePart | null {
  const description = safeString(item.description);
  const quantity = quantityFrom(item.qty, 0);
  if (!description || quantity <= 0) return null;
  const unitPrice = asNumber(item.unit_price);
  const lineTotal = asNumber(item.line_total) ?? (unitPrice == null ? null : Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100);
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
    unitPrice,
    lineTotal,
    status: safeString(item.status) || null,
    pricingState: priceState(unitPrice, lineTotal),
    source: "synced_metadata",
  };
}

function fromTechnicianSnapshot(item: Record<string, Json>): ResolvedQuotePart | null {
  const description = safeString(item.description) || safeString(item.name) || safeString(item.part) || safeString(item.part_name);
  const quantity = quantityFrom(item.qty ?? item.quantity, 0);
  if (!description || quantity <= 0) return null;
  const unitPrice = asNumber(item.unitPrice) ?? asNumber(item.unit_price) ?? asNumber(item.unitCost) ?? asNumber(item.unit_cost);
  const lineTotal = unitPrice == null ? null : Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100;
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
    unitPrice,
    lineTotal,
    status: null,
    pricingState: priceState(unitPrice, lineTotal),
    source: "technician_snapshot",
  };
}

export function resolveQuoteLineParts(input: QuoteLinePartsInput): ResolvedQuotePart[] {
  const selectedParts = input.selectedParts ?? new Map<string, CatalogPart>();
  const live = (input.liveItems ?? [])
    .filter((item) => item.quote_line_id === input.line.id)
    .map((item) => fromLiveItem(item, item.part_id ? selectedParts.get(item.part_id) ?? null : null))
    .filter((item): item is ResolvedQuotePart => Boolean(item));

  const result = new Map<string, ResolvedQuotePart>();
  for (const item of live) result.set(durableKey(item), item);
  if (result.size > 0) return [...result.values()];

  const metadata = metadataRecord(input.line.metadata);
  const partsQuote = recordFromJson(metadata.parts_quote ?? null);
  const syncedItems = Array.isArray(partsQuote?.items) ? partsQuote.items : [];
  for (const raw of syncedItems) {
    const record = recordFromJson(raw);
    if (!record) continue;
    const item = fromSyncedMetadata(record);
    if (item) result.set(durableKey(item), item);
  }
  if (result.size > 0) return [...result.values()];

  const techItems = Array.isArray(metadata.parts) ? metadata.parts : [];
  for (const raw of techItems) {
    const record = recordFromJson(raw);
    if (!record) continue;
    const item = fromTechnicianSnapshot(record);
    if (item) result.set(durableKey(item), item);
  }
  return [...result.values()];
}

export function quoteLineTotalResolved(input: { persistedGrandTotal: unknown; persistedSubtotal: unknown; calculatedLabor: number; calculatedParts: number }): number {
  const calculated = input.calculatedLabor + input.calculatedParts;
  const grand = asNumber(input.persistedGrandTotal);
  if (grand != null && (grand !== 0 || calculated === 0)) return grand;
  const subtotal = asNumber(input.persistedSubtotal);
  if (subtotal != null && (subtotal !== 0 || calculated === 0)) return subtotal;
  return calculated;
}
