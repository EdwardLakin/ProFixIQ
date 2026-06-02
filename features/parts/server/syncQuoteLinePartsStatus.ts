import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;
type QuoteLineRow = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type QuoteLineUpdate = DB["public"]["Tables"]["work_order_quote_lines"]["Update"];
type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];

type SyncResult = {
  ok: boolean;
  quoteLineId: string;
  shopId: string;
  itemCount: number;
  quotedCount: number;
  pendingCount: number;
  partsTotal: number;
  status: string;
  stage: string | null;
  skipped?: string;
  error?: string;
};

const TERMINAL_QUOTE_LINE_STATUSES = new Set([
  "approved",
  "customer_approved",
  "declined",
  "deferred",
  "converted",
  "sent",
  "rejected",
  "cancelled",
]);

const TERMINAL_QUOTE_LINE_STAGES = new Set([
  "approved",
  "customer_approved",
  "declined",
  "deferred",
  "converted",
  "sent",
]);

const IGNORED_ITEM_STATUSES = new Set(["cancelled", "rejected", "declined"]);

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

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function closeMoney(a: unknown, b: unknown): boolean {
  const left = asNumber(a);
  const right = asNumber(b);
  if (left == null || right == null) return false;
  return Math.abs(roundMoney(left) - roundMoney(right)) < 0.01;
}

function metadataRecord(metadata: Json | null): Record<string, Json> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return { ...(metadata as Record<string, Json>) };
}

function quoteLineIsProtected(line: Pick<QuoteLineRow, "status" | "stage" | "approved_at" | "declined_at" | "work_order_line_id">): boolean {
  const status = safeString(line.status).toLowerCase();
  const stage = safeString(line.stage).toLowerCase();
  return (
    TERMINAL_QUOTE_LINE_STATUSES.has(status) ||
    TERMINAL_QUOTE_LINE_STAGES.has(stage) ||
    Boolean(line.approved_at) ||
    Boolean(line.declined_at) ||
    Boolean(line.work_order_line_id)
  );
}

function itemUnitPrice(item: Pick<PartRequestItemRow, "quoted_price" | "unit_price" | "unit_cost">): number | null {
  return asNumber(item.quoted_price) ?? asNumber(item.unit_price) ?? asNumber(item.unit_cost);
}

function itemQuantity(item: Pick<PartRequestItemRow, "qty" | "qty_requested" | "qty_approved">): number {
  return Math.max(0, asNumber(item.qty) ?? asNumber(item.qty_requested) ?? asNumber(item.qty_approved) ?? 0);
}

function itemIsRequired(item: Pick<PartRequestItemRow, "status" | "qty" | "qty_requested" | "qty_approved">): boolean {
  const status = safeString(item.status).toLowerCase();
  return !IGNORED_ITEM_STATUSES.has(status) && itemQuantity(item) > 0;
}

function itemIsQuoted(item: Pick<PartRequestItemRow, "part_id" | "quoted_price" | "unit_price" | "unit_cost" | "status" | "qty" | "qty_requested" | "qty_approved">): boolean {
  if (!itemIsRequired(item)) return true;
  const price = itemUnitPrice(item);
  return Boolean(safeString(item.part_id)) && price != null && price >= 0;
}

function laborTotal(line: Pick<QuoteLineRow, "labor_total" | "labor_hours" | "est_labor_hours" | "metadata">): number {
  const explicit = asNumber(line.labor_total);
  if (explicit != null) return explicit;

  const metadata = metadataRecord(line.metadata);
  const laborRate = asNumber(metadata.labor_rate) ?? 0;
  const hours = asNumber(line.labor_hours) ?? asNumber(line.est_labor_hours) ?? 0;
  return roundMoney(hours * laborRate);
}

function buildPartsQuoteMetadata(items: PartRequestItemRow[], partsTotal: number): Json {
  const requiredItems = items.filter(itemIsRequired);
  const quotedItems = requiredItems.filter(itemIsQuoted);
  const pendingItems = requiredItems.filter((item) => !itemIsQuoted(item));

  return {
    source: "part_request_items",
    synced_at: new Date().toISOString(),
    required_count: requiredItems.length,
    quoted_count: quotedItems.length,
    pending_count: pendingItems.length,
    parts_total: partsTotal,
    items: requiredItems.map((item) => {
      const qty = itemQuantity(item);
      const unit = itemUnitPrice(item);
      return {
        id: item.id,
        request_id: item.request_id,
        description: item.description,
        qty,
        unit_price: unit,
        line_total: unit == null ? null : roundMoney(qty * unit),
        status: item.status,
        part_id: item.part_id,
        vendor: item.vendor,
        vendor_id: item.vendor_id,
      };
    }),
  } satisfies Json;
}

export async function syncQuoteLinePartsStatus(
  supabase: SupabaseClient<DB>,
  input: { shopId: string; quoteLineId: string },
): Promise<SyncResult> {
  const shopId = safeString(input.shopId);
  const quoteLineId = safeString(input.quoteLineId);

  if (!shopId || !quoteLineId) {
    return {
      ok: false,
      quoteLineId,
      shopId,
      itemCount: 0,
      quotedCount: 0,
      pendingCount: 0,
      partsTotal: 0,
      status: "",
      stage: null,
      error: "shopId and quoteLineId are required",
    };
  }

  const { data: quoteLine, error: quoteLineError } = await supabase
    .from("work_order_quote_lines")
    .select("id, shop_id, work_order_id, status, stage, approved_at, declined_at, work_order_line_id, labor_total, labor_hours, est_labor_hours, parts_total, subtotal, grand_total, tax_total, metadata")
    .eq("shop_id", shopId)
    .eq("id", quoteLineId)
    .maybeSingle();

  if (quoteLineError || !quoteLine) {
    return {
      ok: false,
      quoteLineId,
      shopId,
      itemCount: 0,
      quotedCount: 0,
      pendingCount: 0,
      partsTotal: 0,
      status: "",
      stage: null,
      error: quoteLineError?.message ?? "Quote line not found",
    };
  }

  const line = quoteLine as Pick<
    QuoteLineRow,
    | "id"
    | "shop_id"
    | "work_order_id"
    | "status"
    | "stage"
    | "approved_at"
    | "declined_at"
    | "work_order_line_id"
    | "labor_total"
    | "labor_hours"
    | "est_labor_hours"
    | "parts_total"
    | "subtotal"
    | "grand_total"
    | "tax_total"
    | "metadata"
  >;

  const { data: itemsRaw, error: itemsError } = await supabase
    .from("part_request_items")
    .select("id, request_id, shop_id, work_order_id, quote_line_id, description, qty, qty_requested, qty_approved, quoted_price, unit_price, unit_cost, status, part_id, vendor, vendor_id")
    .eq("shop_id", shopId)
    .eq("work_order_id", line.work_order_id)
    .eq("quote_line_id", quoteLineId)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return {
      ok: false,
      quoteLineId,
      shopId,
      itemCount: 0,
      quotedCount: 0,
      pendingCount: 0,
      partsTotal: 0,
      status: line.status,
      stage: line.stage,
      error: itemsError.message,
    };
  }

  const items = (itemsRaw ?? []) as PartRequestItemRow[];
  const requiredItems = items.filter(itemIsRequired);
  const quotedItems = requiredItems.filter(itemIsQuoted);
  const pendingItems = requiredItems.filter((item) => !itemIsQuoted(item));
  const partsTotal = roundMoney(
    quotedItems.reduce((sum, item) => {
      const unit = itemUnitPrice(item) ?? 0;
      return sum + itemQuantity(item) * unit;
    }, 0),
  );
  const allQuoted = requiredItems.length > 0 && pendingItems.length === 0;
  const nextStatus = allQuoted ? "quoted" : "pending_parts";
  const nextStage = allQuoted ? "ready_to_send" : "advisor_pending";

  if (quoteLineIsProtected(line)) {
    return {
      ok: true,
      quoteLineId,
      shopId,
      itemCount: requiredItems.length,
      quotedCount: quotedItems.length,
      pendingCount: pendingItems.length,
      partsTotal,
      status: line.status,
      stage: line.stage,
      skipped: "protected_quote_line_state",
    };
  }

  const oldPartsTotal = asNumber(line.parts_total) ?? 0;
  const nextLaborTotal = laborTotal(line);
  const nextSubtotal = roundMoney(nextLaborTotal + partsTotal);
  const taxTotal = asNumber(line.tax_total) ?? 0;
  const currentSubtotal = asNumber(line.subtotal);
  const currentGrandTotal = asNumber(line.grand_total);
  const currentComputedSubtotal = roundMoney(nextLaborTotal + oldPartsTotal);
  const shouldUpdateSubtotal = currentSubtotal == null || closeMoney(currentSubtotal, currentComputedSubtotal);
  const shouldUpdateGrandTotal =
    currentGrandTotal == null ||
    (currentSubtotal != null && closeMoney(currentGrandTotal, currentSubtotal + taxTotal));

  const metadata = metadataRecord(line.metadata);
  metadata.parts_quote = buildPartsQuoteMetadata(items, partsTotal);

  const update: QuoteLineUpdate = {
    metadata: metadata as Json,
    parts_total: partsTotal,
    status: nextStatus,
    stage: nextStage,
    updated_at: new Date().toISOString(),
    ...(shouldUpdateSubtotal ? { subtotal: nextSubtotal } : {}),
    ...(shouldUpdateGrandTotal ? { grand_total: roundMoney((shouldUpdateSubtotal ? nextSubtotal : (currentSubtotal ?? nextSubtotal)) + taxTotal) } : {}),
  };

  const { error: updateError } = await supabase
    .from("work_order_quote_lines")
    .update(update)
    .eq("shop_id", shopId)
    .eq("work_order_id", line.work_order_id)
    .eq("id", quoteLineId);

  if (updateError) {
    return {
      ok: false,
      quoteLineId,
      shopId,
      itemCount: requiredItems.length,
      quotedCount: quotedItems.length,
      pendingCount: pendingItems.length,
      partsTotal,
      status: line.status,
      stage: line.stage,
      error: updateError.message,
    };
  }

  return {
    ok: true,
    quoteLineId,
    shopId,
    itemCount: requiredItems.length,
    quotedCount: quotedItems.length,
    pendingCount: pendingItems.length,
    partsTotal,
    status: nextStatus,
    stage: nextStage,
  };
}
