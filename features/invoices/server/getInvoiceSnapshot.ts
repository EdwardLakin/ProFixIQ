import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { resolveWorkOrderLinePricing } from "@/features/work-orders/lib/pricing/resolveWorkOrderLinePricing";
import {
  calculateShopSupplies,
  resolveShopSuppliesOverride,
  resolveShopSuppliesSettings,
} from "@/features/work-orders/lib/shopSupplies";
import { calculateInvoiceTotals } from "@/features/invoices/lib/invoiceTotals";
import { filterInvoicePartAllocations } from "@/features/invoices/lib/filterInvoicePartAllocations";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type InvoiceRow = DB["public"]["Tables"]["invoices"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type AllocationRow = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type WorkOrderQuoteLineRow = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type WorkOrderPartRow = DB["public"]["Tables"]["work_order_parts"]["Row"];
type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];
type PartRequestRow = DB["public"]["Tables"]["part_requests"]["Row"];

export type InvoiceSnapshotPart = {
  id: string;
  lineId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  sku?: string;
  partNumber?: string;
  unit?: string;
  vendor?: string;
  source?: "work_order_part_allocation" | "work_order_part" | "quote_line_part_request";
};

export type InvoiceSnapshotLine = Pick<
  WorkOrderLineRow,
  | "id"
  | "line_no"
  | "description"
  | "complaint"
  | "cause"
  | "correction"
  | "labor_time"
  | "price_estimate"
  | "intake_json"
> & {
  resolvedLaborHours: number;
  resolvedLaborRate: number;
  resolvedLaborTotal: number;
  resolvedPartsTotal: number;
  resolvedLineTotal: number;
};

export type InvoiceSnapshot = {
  workOrder: Pick<
    WorkOrderRow,
    | "id"
    | "shop_id"
    | "customer_id"
    | "vehicle_id"
    | "customer_name"
    | "custom_id"
    | "labor_total"
    | "parts_total"
    | "invoice_total"
    | "shop_supplies_enabled_override"
    | "shop_supplies_amount_override"
    | "created_at"
  >;
  invoice: Pick<
    InvoiceRow,
    | "id"
    | "invoice_number"
    | "status"
    | "currency"
    | "subtotal"
    | "parts_cost"
    | "labor_cost"
    | "discount_total"
    | "tax_total"
    | "total"
    | "issued_at"
    | "created_at"
    | "notes"
  > | null;
  shop: Pick<
    ShopRow,
    | "business_name"
    | "shop_name"
    | "name"
    | "country"
    | "phone_number"
    | "email"
    | "street"
    | "city"
    | "province"
    | "postal_code"
    | "labor_rate"
    | "supplies_percent"
    | "shop_supplies_enabled"
    | "shop_supplies_type"
    | "shop_supplies_percent"
    | "shop_supplies_flat_amount"
    | "shop_supplies_cap_amount"
    | "tax_rate"
  > | null;
  customer: Pick<
    CustomerRow,
    | "name"
    | "first_name"
    | "last_name"
    | "phone"
    | "phone_number"
    | "email"
    | "business_name"
    | "street"
    | "city"
    | "province"
    | "postal_code"
  > | null;
  vehicle: Pick<
    VehicleRow,
    | "year"
    | "make"
    | "model"
    | "vin"
    | "license_plate"
    | "unit_number"
    | "mileage"
    | "color"
    | "engine_hours"
  > | null;
  lines: InvoiceSnapshotLine[];
  parts: InvoiceSnapshotPart[];
  currency: "CAD" | "USD";
  laborCost: number | null;
  partsCost: number | null;
  shopSuppliesTotal: number | null;
  subtotal: number | null;
  discountTotal: number | null;
  taxTotal: number | null;
  taxRate?: number | null;
  total: number | null;
};

function safeNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function positiveOrNull(v: unknown): number | null {
  const n = safeNumberOrNull(v);
  return n != null && n > 0 ? n : null;
}

function normalizeInvoiceCurrency(v: unknown): "CAD" | "USD" | null {
  const c = String(v ?? "").trim().toUpperCase();
  if (c === "CAD") return "CAD";
  if (c === "USD") return "USD";
  return null;
}

function normalizeCurrencyFromCountry(country: unknown): "CAD" | "USD" {
  const c = String(country ?? "").trim().toUpperCase();
  return c === "CA" ? "CAD" : "USD";
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

const BILLABLE_PART_REQUEST_ITEM_STATUSES = new Set([
  "quoted",
  "approved",
  "reserved",
  "picking",
  "picked",
  "ordered",
  "partially_received",
  "received",
  "fulfilled",
  "consumed",
]);

const NON_BILLABLE_QUOTE_LINE_STATUSES = new Set([
  "declined",
  "deferred",
  "rejected",
  "cancelled",
  "canceled",
]);

function itemUnitPrice(
  item: Pick<PartRequestItemRow, "quoted_price" | "unit_price">,
): number {
  // unit_cost is the shop's private acquisition cost. A missing customer sell
  // price must remain visible as a pricing error instead of underbilling at cost.
  return (
    safeNumberOrNull(item.quoted_price) ??
    safeNumberOrNull(item.unit_price) ??
    0
  );
}

function itemQuantity(item: Pick<PartRequestItemRow, "qty" | "qty_requested" | "qty_approved">): number {
  const qty = safeNumber(item.qty);
  const requested = safeNumber(item.qty_requested);
  const approved = safeNumber(item.qty_approved);
  const resolved = qty > 0 ? qty : requested > 0 ? requested : approved;
  return resolved > 0 ? resolved : 1;
}

function quoteLineIsInvoiceFallbackEligible(
  quote: Pick<WorkOrderQuoteLineRow, "status" | "work_order_line_id"> | undefined,
  lineId: string,
): boolean {
  if (!quote?.work_order_line_id || quote.work_order_line_id !== lineId) return false;
  const status = String(quote.status ?? "").trim().toLowerCase();
  return !NON_BILLABLE_QUOTE_LINE_STATUSES.has(status);
}

function partRequestItemIsInvoiceFallbackEligible(
  item: Pick<
    PartRequestItemRow,
    | "shop_id"
    | "work_order_id"
    | "work_order_line_id"
    | "quote_line_id"
    | "request_id"
    | "status"
    | "approved"
    | "qty"
    | "qty_requested"
    | "qty_approved"
  >,
  args: {
    shopId: string;
    workOrderId: string;
    workOrderLineId: string;
    requestQuoteLineIdByRequestId: Map<string, string>;
    quoteLineById: Map<string, Pick<WorkOrderQuoteLineRow, "status" | "work_order_line_id">>;
  },
): boolean {
  if (item.shop_id !== args.shopId) return false;
  if (item.work_order_id !== args.workOrderId) return false;
  if (item.work_order_line_id !== args.workOrderLineId) return false;

  const status = String(item.status ?? "").trim().toLowerCase();
  const statusIsBillable = BILLABLE_PART_REQUEST_ITEM_STATUSES.has(status);
  if (!statusIsBillable && item.approved !== true) return false;
  if (itemQuantity(item) <= 0) return false;

  const quoteLineId =
    (isNonEmptyString(item.quote_line_id) ? item.quote_line_id.trim() : "") ||
    args.requestQuoteLineIdByRequestId.get(item.request_id) ||
    "";
  if (!quoteLineId) return false;

  return quoteLineIsInvoiceFallbackEligible(
    args.quoteLineById.get(quoteLineId),
    args.workOrderLineId,
  );
}

export async function getInvoiceSnapshotForWorkOrder(args: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
}): Promise<InvoiceSnapshot> {
  const { supabase, workOrderId } = args;

  const { data: workOrder, error: woErr } = await supabase
    .from("work_orders")
    .select(
      "id, shop_id, customer_id, vehicle_id, customer_name, custom_id, labor_total, parts_total, invoice_total, shop_supplies_enabled_override, shop_supplies_amount_override, created_at",
    )
    .eq("id", workOrderId)
    .maybeSingle<
      Pick<
        WorkOrderRow,
        | "id"
        | "shop_id"
        | "customer_id"
        | "vehicle_id"
        | "customer_name"
        | "custom_id"
        | "labor_total"
        | "parts_total"
        | "invoice_total"
        | "shop_supplies_enabled_override"
        | "shop_supplies_amount_override"
        | "created_at"
      >
    >();

  if (woErr || !workOrder) {
    throw new Error(woErr?.message || "Work order not found.");
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, currency, subtotal, parts_cost, labor_cost, discount_total, tax_total, total, issued_at, created_at, notes",
    )
    .eq("work_order_id", workOrderId)
    .order("issued_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<
      Pick<
        InvoiceRow,
        | "id"
        | "invoice_number"
        | "status"
        | "currency"
        | "subtotal"
        | "parts_cost"
        | "labor_cost"
        | "discount_total"
        | "tax_total"
        | "total"
        | "issued_at"
        | "created_at"
        | "notes"
      >
    >();

  // Match the work-order page exactly for labor pricing. That page reads
  // labor_rate in a dedicated query, so unrelated shop settings cannot turn
  // one labor hour into one dollar on the billing card.
  const { data: workOrderShopRate, error: workOrderShopRateError } = await supabase
    .from("shops")
    .select("labor_rate")
    .eq("id", workOrder.shop_id)
    .maybeSingle<Pick<ShopRow, "labor_rate">>();

  if (workOrderShopRateError) {
    throw new Error(
      `Shop labor rate is unavailable: ${workOrderShopRateError.message}`,
    );
  }

  const shopResult = await supabase
    .from("shops")
    .select(
      "business_name, shop_name, name, country, phone_number, email, street, city, province, postal_code, labor_rate, supplies_percent, shop_supplies_enabled, shop_supplies_type, shop_supplies_percent, shop_supplies_flat_amount, shop_supplies_cap_amount, tax_rate",
    )
    .eq("id", workOrder.shop_id)
    .maybeSingle<
      Pick<
        ShopRow,
        | "business_name"
        | "shop_name"
        | "name"
        | "country"
        | "phone_number"
        | "email"
        | "street"
        | "city"
        | "province"
        | "postal_code"
        | "labor_rate"
    | "supplies_percent"
    | "shop_supplies_enabled"
    | "shop_supplies_type"
    | "shop_supplies_percent"
    | "shop_supplies_flat_amount"
    | "shop_supplies_cap_amount"
    | "tax_rate"
      >
    >();

  // Keep the core labor/tax lookup usable when a deployment has not refreshed
  // every optional shop-supplies column yet. PostgREST rejects the entire
  // select when even one selected column is unavailable, which previously
  // turned a configured $140 rate into a null shop row and then a $1 fallback.
  const shopFallbackResult = shopResult.error || !shopResult.data
    ? await supabase
        .from("shops")
        .select(
          "business_name, shop_name, name, country, phone_number, email, street, city, province, postal_code, labor_rate, supplies_percent, tax_rate",
        )
        .eq("id", workOrder.shop_id)
        .maybeSingle<
          Pick<
            ShopRow,
            | "business_name"
            | "shop_name"
            | "name"
            | "country"
            | "phone_number"
            | "email"
            | "street"
            | "city"
            | "province"
            | "postal_code"
            | "labor_rate"
            | "supplies_percent"
            | "tax_rate"
          >
        >()
    : null;

  if (shopFallbackResult?.error) {
    throw new Error(
      `Shop pricing configuration is unavailable: ${shopFallbackResult.error.message}`,
    );
  }

  const shopCore = shopResult.data ?? shopFallbackResult?.data ?? null;
  if (!shopCore) {
    throw new Error("Shop labor and tax configuration could not be loaded.");
  }
  const shop = shopCore
    ? ({
        shop_supplies_enabled: null,
        shop_supplies_type: null,
        shop_supplies_percent: null,
        shop_supplies_flat_amount: null,
        shop_supplies_cap_amount: null,
        ...shopCore,
        labor_rate: workOrderShopRate?.labor_rate ?? shopCore.labor_rate,
      } as InvoiceSnapshot["shop"])
    : null;

  const { data: customer } = workOrder.customer_id
    ? await supabase
        .from("customers")
        .select(
          "name, first_name, last_name, phone, phone_number, email, business_name, street, city, province, postal_code",
        )
        .eq("id", workOrder.customer_id)
        .maybeSingle<
          Pick<
            CustomerRow,
            | "name"
            | "first_name"
            | "last_name"
            | "phone"
            | "phone_number"
            | "email"
            | "business_name"
            | "street"
            | "city"
            | "province"
            | "postal_code"
          >
        >()
    : { data: null };

  const { data: vehicle } = workOrder.vehicle_id
    ? await supabase
        .from("vehicles")
        .select(
          "year, make, model, vin, license_plate, unit_number, mileage, color, engine_hours",
        )
        .eq("id", workOrder.vehicle_id)
        .maybeSingle<
          Pick<
            VehicleRow,
            | "year"
            | "make"
            | "model"
            | "vin"
            | "license_plate"
            | "unit_number"
            | "mileage"
            | "color"
            | "engine_hours"
          >
        >()
    : { data: null };

  const { data: linesRaw, error: linesError } = await supabase
    .from("work_order_lines")
    .select("id, line_no, description, complaint, cause, correction, labor_time, price_estimate, intake_json")
    .eq("shop_id", workOrder.shop_id)
    .eq("work_order_id", workOrderId)
    .order("line_no", { ascending: true })
    .returns<
      Array<
        Pick<
          WorkOrderLineRow,
          | "id"
          | "line_no"
          | "description"
          | "complaint"
          | "cause"
          | "correction"
          | "labor_time"
          | "price_estimate"
          | "intake_json"
        >
      >
    >();

  if (linesError) {
    throw new Error(`Work-order labor lines are unavailable: ${linesError.message}`);
  }

  const lines = Array.isArray(linesRaw) ? linesRaw : [];

  const { data: allocRaw, error: allocationsError } = await supabase
    .from("work_order_part_allocations")
    .select("id, shop_id, work_order_id, work_order_line_id, part_id, qty, unit_cost, source_request_item_id, created_at")
    .eq("shop_id", workOrder.shop_id)
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: true })
    .returns<
      Array<
        Pick<
          AllocationRow,
          "id" | "shop_id" | "work_order_id" | "work_order_line_id" | "part_id" | "qty" | "unit_cost" | "source_request_item_id" | "created_at"
        >
      >
    >();

  if (allocationsError) {
    throw new Error(`Allocated work-order parts are unavailable: ${allocationsError.message}`);
  }

  const allocs = Array.isArray(allocRaw) ? allocRaw : [];
  const stagedPartsResult = await supabase
    .from("work_order_parts")
    .select("id, shop_id, work_order_line_id, part_id, quantity, unit_price, total_price, description_snapshot, manufacturer_snapshot, part_number_snapshot, quantity_requested, quantity_consumed, quantity_returned, quantity_cancelled, unit_sell_price_snapshot, lifecycle_status, source_parts_request_item_id, is_active")
    .eq("shop_id", workOrder.shop_id)
    .eq("work_order_id", workOrderId)
    .returns<
      Array<
        Pick<WorkOrderPartRow, "id" | "shop_id" | "work_order_line_id" | "part_id" | "quantity" | "unit_price" | "total_price"> & Record<string, unknown>
      >
    >();

  // The lifecycle/snapshot columns are newer than the original
  // work_order_parts shape. Fall back to the stable pricing columns so an
  // older deployed schema still invoices its attached parts instead of
  // returning an empty parts array.
  const stagedPartsFallbackResult = stagedPartsResult.error
    ? await supabase
        .from("work_order_parts")
        .select(
          "id, shop_id, work_order_line_id, part_id, quantity, unit_price, total_price",
        )
        .eq("shop_id", workOrder.shop_id)
        .eq("work_order_id", workOrderId)
        .returns<
          Array<
            Pick<
              WorkOrderPartRow,
              | "id"
              | "shop_id"
              | "work_order_line_id"
              | "part_id"
              | "quantity"
              | "unit_price"
              | "total_price"
            >
          >
        >()
    : null;

  if (stagedPartsFallbackResult?.error) {
    throw new Error(
      `Attached work-order parts are unavailable: ${stagedPartsFallbackResult.error.message}`,
    );
  }

  const stagedPartsRaw =
    stagedPartsResult.data ?? stagedPartsFallbackResult?.data ?? [];
  const stagedParts = Array.isArray(stagedPartsRaw) ? stagedPartsRaw : [];

  const { data: quoteRaw } = await supabase
    .from("work_order_quote_lines")
    .select("id, work_order_line_id, status, labor_hours, est_labor_hours, labor_total, parts_total, subtotal, grand_total")
    .eq("shop_id", workOrder.shop_id)
    .eq("work_order_id", workOrderId)
    .returns<Array<Pick<WorkOrderQuoteLineRow, "id" | "work_order_line_id" | "status" | "labor_hours" | "est_labor_hours" | "labor_total" | "parts_total" | "subtotal" | "grand_total">>>();
  const activeQuotes = (Array.isArray(quoteRaw) ? quoteRaw : []).filter((q) => {
    const s = String(q.status ?? "").toLowerCase();
    return s !== "converted" && !NON_BILLABLE_QUOTE_LINE_STATUSES.has(s);
  });

  const quoteLines = Array.isArray(quoteRaw) ? quoteRaw : [];
  const quoteLineById = new Map<
    string,
    Pick<WorkOrderQuoteLineRow, "status" | "work_order_line_id">
  >();
  for (const q of quoteLines) {
    if (isNonEmptyString(q.id)) {
      quoteLineById.set(q.id, {
        status: q.status,
        work_order_line_id: q.work_order_line_id,
      });
    }
  }

  const { data: requestItemsRaw, error: requestItemsError } = await supabase
    .from("part_request_items")
    .select("id, request_id, shop_id, work_order_id, work_order_line_id, quote_line_id, description, qty, qty_requested, qty_approved, quoted_price, unit_price, unit_cost, status, approved, part_id, vendor")
    .eq("shop_id", workOrder.shop_id)
    .eq("work_order_id", workOrderId)
    .returns<
      Array<
        Pick<
          PartRequestItemRow,
          | "id"
          | "request_id"
          | "shop_id"
          | "work_order_id"
          | "work_order_line_id"
          | "quote_line_id"
          | "description"
          | "qty"
          | "qty_requested"
          | "qty_approved"
          | "quoted_price"
          | "unit_price"
          | "unit_cost"
          | "status"
          | "approved"
          | "part_id"
          | "vendor"
        >
      >
    >();

  if (requestItemsError) {
    throw new Error(`Parts pricing is unavailable: ${requestItemsError.message}`);
  }

  const requestItems = Array.isArray(requestItemsRaw) ? requestItemsRaw : [];
  const requestIdsNeedingQuoteLink = Array.from(
    new Set(
      requestItems
        .filter((item) => !isNonEmptyString(item.quote_line_id))
        .map((item) => item.request_id)
        .filter(isNonEmptyString),
    ),
  );

  const requestQuoteLineIdByRequestId = new Map<string, string>();
  if (requestIdsNeedingQuoteLink.length > 0) {
    const { data: requestRows } = await supabase
      .from("part_requests")
      .select("id, shop_id, work_order_id, quote_line_id")
      .eq("shop_id", workOrder.shop_id)
      .eq("work_order_id", workOrderId)
      .in("id", requestIdsNeedingQuoteLink)
      .returns<
        Array<Pick<PartRequestRow, "id" | "shop_id" | "work_order_id" | "quote_line_id">>
      >();

    for (const request of Array.isArray(requestRows) ? requestRows : []) {
      if (
        request.shop_id === workOrder.shop_id &&
        request.work_order_id === workOrderId &&
        isNonEmptyString(request.id) &&
        isNonEmptyString(request.quote_line_id)
      ) {
        requestQuoteLineIdByRequestId.set(request.id, request.quote_line_id.trim());
      }
    }
  }

  const byLineStaged = new Map<string, typeof stagedParts>();
  for (const part of stagedParts) {
    if (!part.work_order_line_id) continue;
    byLineStaged.set(part.work_order_line_id, [
      ...(byLineStaged.get(part.work_order_line_id) ?? []),
      part,
    ]);
  }
  const byLineAlloc = new Map<string, typeof allocs>();
  for (const alloc of allocs) {
    if (!alloc.work_order_line_id) continue;
    byLineAlloc.set(alloc.work_order_line_id, [
      ...(byLineAlloc.get(alloc.work_order_line_id) ?? []),
      alloc,
    ]);
  }

  const fallbackRequestItems = requestItems.filter((item) => {
    const lineId = isNonEmptyString(item.work_order_line_id) ? item.work_order_line_id.trim() : "";
    if (!lineId) return false;

    return partRequestItemIsInvoiceFallbackEligible(item, {
      shopId: workOrder.shop_id,
      workOrderId,
      workOrderLineId: lineId,
      requestQuoteLineIdByRequestId,
      quoteLineById,
    });
  });

  const byLineFallbackRequestItems = new Map<string, typeof fallbackRequestItems>();
  for (const item of fallbackRequestItems) {
    if (!item.work_order_line_id) continue;
    byLineFallbackRequestItems.set(item.work_order_line_id, [
      ...(byLineFallbackRequestItems.get(item.work_order_line_id) ?? []),
      item,
    ]);
  }

  const partIds = Array.from(
    new Set(
      [
        ...allocs.map((a) => a.part_id),
        ...stagedParts.map((part) => part.part_id),
        ...fallbackRequestItems.map((item) => item.part_id),
      ]
        .filter(isNonEmptyString)
        .map((id) => id.trim()),
    ),
  );

  const partsMap = new Map<
    string,
    Pick<
      PartRow,
      "id" | "name" | "sku" | "part_number" | "unit" | "price" | "default_price"
    >
  >();

  if (partIds.length > 0) {
    const { data: partRows, error: partRowsError } = await supabase
      .from("parts")
      .select("id, name, sku, part_number, unit, price, default_price")
      .eq("shop_id", workOrder.shop_id)
      .in("id", partIds)
      .returns<
        Array<
          Pick<
            PartRow,
            | "id"
            | "name"
            | "sku"
            | "part_number"
            | "unit"
            | "price"
            | "default_price"
          >
        >
      >();

    if (partRowsError) {
      throw new Error(`Parts catalog pricing is unavailable: ${partRowsError.message}`);
    }

    for (const p of Array.isArray(partRows) ? partRows : []) {
      if (isNonEmptyString(p.id)) partsMap.set(p.id, p);
    }
  }

  const requestItemById = new Map(requestItems.map((item) => [item.id, item]));
  const allocationPartById = new Map<string, InvoiceSnapshotPart>();
  for (const a of allocs) {
    const p = isNonEmptyString(a.part_id) ? partsMap.get(a.part_id) : undefined;
    const requestItem = isNonEmptyString(a.source_request_item_id)
      ? requestItemById.get(a.source_request_item_id)
      : undefined;
    const qtyRaw = safeNumber(a.qty);
    const qty = qtyRaw > 0 ? qtyRaw : 1;
    // Match FocusedJobModal's allocated-parts calculation exactly. The current
    // work-order flow stores and displays the allocation price from unit_cost.
    // Request/catalog values remain fallbacks for records without that value.
    const unitPrice =
      safeNumber(a.unit_cost) ||
      (requestItem ? itemUnitPrice(requestItem) : 0) ||
      safeNumber(p?.price) ||
      safeNumber(p?.default_price);
    const totalPrice = Math.max(0, qty * unitPrice);
    const lidRaw = a.work_order_line_id;
    const lineId = isNonEmptyString(lidRaw) ? lidRaw.trim() : undefined;

    allocationPartById.set(String(a.id), {
      id: String(a.id),
      lineId,
      name: (p?.name ?? "Part").trim() || "Part",
      qty,
      unitPrice,
      totalPrice,
      sku: (p?.sku ?? "").trim() || undefined,
      partNumber: (p?.part_number ?? "").trim() || undefined,
      unit: (p?.unit ?? "").trim() || undefined,
      source: "work_order_part_allocation",
    });
  }

  const stagedInvoiceParts: InvoiceSnapshotPart[] = stagedParts.flatMap((part) => {
    const p = isNonEmptyString(part.part_id) ? partsMap.get(part.part_id) : undefined;
    const partRecord = part as Record<string, unknown>;
    if (partRecord.is_active === false) return [];
    const consumed = safeNumber(partRecord.quantity_consumed);
    const returned = safeNumber(partRecord.quantity_returned);
    const cancelled = safeNumber(partRecord.quantity_cancelled);
    const requested = safeNumber(partRecord.quantity_requested);
    const qty =
      consumed > 0
        ? Math.max(0, consumed - returned)
        : Math.max(0, (requested > 0 ? requested : safeNumber(part.quantity)) - cancelled);
    if (qty <= 0) return [];
    const totalRaw = safeNumber(part.total_price);
    const unitPrice =
      safeNumber(partRecord.unit_sell_price_snapshot) ||
      safeNumber(part.unit_price) ||
      safeNumber(p?.price) ||
      safeNumber(p?.default_price);
    const totalPrice = unitPrice > 0 ? Math.max(0, qty * unitPrice) : totalRaw;
    const lineId = isNonEmptyString(part.work_order_line_id)
      ? part.work_order_line_id.trim()
      : undefined;

    return [{
      id: String(part.id),
      lineId,
      name: (String(partRecord.description_snapshot ?? "").trim() || (p?.name ?? "Part")).trim() || "Part",
      qty,
      unitPrice,
      totalPrice,
      sku: (p?.sku ?? "").trim() || undefined,
      partNumber: (String(partRecord.part_number_snapshot ?? "").trim() || (p?.part_number ?? "")).trim() || undefined,
      unit: (p?.unit ?? "").trim() || undefined,
      source: "work_order_part",
    }];
  });

  const requestItemInvoiceParts: InvoiceSnapshotPart[] = fallbackRequestItems.map((item) => {
    const p = isNonEmptyString(item.part_id) ? partsMap.get(item.part_id) : undefined;
    const qty = itemQuantity(item);
    const unitPrice = itemUnitPrice(item);
    const lineId = isNonEmptyString(item.work_order_line_id)
      ? item.work_order_line_id.trim()
      : undefined;
    const name =
      (item.description ?? "").trim() ||
      (p?.name ?? "").trim() ||
      "Part";

    return {
      id: String(item.id),
      lineId,
      name,
      qty,
      unitPrice,
      totalPrice: Math.max(0, qty * unitPrice),
      sku: (p?.sku ?? "").trim() || undefined,
      partNumber: (p?.part_number ?? "").trim() || undefined,
      unit: (p?.unit ?? "").trim() || undefined,
      vendor: (item.vendor ?? "").trim() || undefined,
      source: "quote_line_part_request",
    };
  });

  const stagedPartsByLineForDisplay = new Map<string, InvoiceSnapshotPart[]>();
  for (const part of stagedInvoiceParts) {
    if (!part.lineId) continue;
    stagedPartsByLineForDisplay.set(part.lineId, [
      ...(stagedPartsByLineForDisplay.get(part.lineId) ?? []),
      part,
    ]);
  }

  const fallbackPartsByLineForDisplay = new Map<string, InvoiceSnapshotPart[]>();
  for (const part of requestItemInvoiceParts) {
    if (!part.lineId) continue;
    fallbackPartsByLineForDisplay.set(part.lineId, [
      ...(fallbackPartsByLineForDisplay.get(part.lineId) ?? []),
      part,
    ]);
  }

  const parts: InvoiceSnapshotPart[] = [];
  for (const line of lines) {
    const lineAllocations = byLineAlloc.get(line.id) ?? [];
    const lineStaged = stagedPartsByLineForDisplay.get(line.id) ?? [];
    const rawLineStaged = byLineStaged.get(line.id) ?? [];
    const displayedStagedIds = new Set(lineStaged.map((part) => part.id));
    const unbackedAllocations = filterInvoicePartAllocations({
      allocations: lineAllocations,
      stagedParts: rawLineStaged as Array<
        typeof rawLineStaged[number] & {
          source_parts_request_item_id?: string | null;
        }
      >,
      displayedStagedPartIds: displayedStagedIds,
    });
    const unbackedAllocationParts = unbackedAllocations.flatMap((allocation) => {
      const part = allocationPartById.get(String(allocation.id));
      return part ? [part] : [];
    });

    if (lineStaged.length > 0) {
      parts.push(...lineStaged);
      parts.push(...unbackedAllocationParts);
      continue;
    }

    if (unbackedAllocationParts.length > 0) {
      parts.push(...unbackedAllocationParts);
      continue;
    }

    parts.push(...(fallbackPartsByLineForDisplay.get(line.id) ?? []));
  }

  const unpricedPart = parts.find(
    (part) => safeNumber(part.qty) > 0 && safeNumber(part.unitPrice) <= 0,
  );
  if (unpricedPart) {
    throw new Error(
      `Customer sell price is missing for ${unpricedPart.name || "an attached part"}.`,
    );
  }
  if (
    parts.length === 0 &&
    (allocs.length > 0 || stagedInvoiceParts.length > 0 || fallbackRequestItems.length > 0)
  ) {
    throw new Error(
      "Attached parts could not be resolved into invoice line items.",
    );
  }

  const currency =
    normalizeInvoiceCurrency(invoice?.currency) ??
    normalizeCurrencyFromCountry(shop?.country);

  const invSubtotal = invoice ? safeNumberOrNull(invoice.subtotal) : null;
  const invLabor = invoice ? safeNumberOrNull(invoice.labor_cost) : null;
  const invParts = invoice ? safeNumberOrNull(invoice.parts_cost) : null;
  const invTotal = invoice ? safeNumberOrNull(invoice.total) : null;
  const invDiscount = safeNumber(invoice?.discount_total);
  const invTax = safeNumber(invoice?.tax_total);

  const woLabor = positiveOrNull(workOrder.labor_total);
  const woParts = positiveOrNull(workOrder.parts_total);
  const woInvoiceTotal = positiveOrNull(workOrder.invoice_total);

  const byLineQuote = new Map<string, typeof activeQuotes[number]>();
  for (const q of activeQuotes) {
    if (!q.work_order_line_id) continue;
    byLineQuote.set(q.work_order_line_id, q);
  }

  let resolvedLabor = 0;
  let resolvedParts = 0;
  const pricedLines: InvoiceSnapshotLine[] = [];
  for (const line of lines) {
    const lineParts = parts.filter((part) => part.lineId === line.id);
    const stagedPricingParts = lineParts.map((part) => ({
      quantity: part.qty,
      unit_price: part.unitPrice,
      total_price: part.totalPrice,
    }));

    const resolved = resolveWorkOrderLinePricing({
      line,
      quote: byLineQuote.get(line.id) ?? null,
      shopLaborRate: safeNumberOrNull(shop?.labor_rate),
      stagedParts: stagedPricingParts,
      allocatedParts: [],
    });
    const resolvedLineParts =
      lineParts.length > 0
        ? lineParts.reduce((sum, part) => sum + safeNumber(part.totalPrice), 0)
        : resolved.partsTotal;
    resolvedLabor += resolved.laborTotal;
    resolvedParts += resolvedLineParts;
    pricedLines.push({
      ...line,
      resolvedLaborHours: resolved.laborHours,
      resolvedLaborRate: resolved.laborRate,
      resolvedLaborTotal: resolved.laborTotal,
      resolvedPartsTotal: resolvedLineParts,
      resolvedLineTotal: resolved.laborTotal + resolvedLineParts,
    });
  }

  const unresolvedLaborLine = pricedLines.find(
    (line) => line.resolvedLaborHours > 0 && line.resolvedLaborTotal <= 0,
  );
  if (!invoice && unresolvedLaborLine) {
    throw new Error(
      `Labor rate is missing for ${unresolvedLaborLine.description || `line ${unresolvedLaborLine.line_no ?? ""}`.trim()}.`,
    );
  }

  // Existing line items are authoritative. work_orders.labor_total has legacy
  // rows where 1.0 represents labor hours, not $1.00, so only use that rollup
  // when there are no itemized lines to price.
  const laborCost =
    invLabor ??
    (resolvedLabor > 0 ? resolvedLabor : pricedLines.length === 0 ? woLabor : null) ??
    null;
  const partsCost = invParts ?? (resolvedParts > 0 ? resolvedParts : woParts) ?? null;

  const baseSubtotal = (laborCost ?? 0) + (partsCost ?? 0);
  const shopSupplies = calculateShopSupplies({
    baseAmount: baseSubtotal,
    settings: resolveShopSuppliesSettings(shop as Parameters<typeof resolveShopSuppliesSettings>[0]),
    override: resolveShopSuppliesOverride(workOrder as Parameters<typeof resolveShopSuppliesOverride>[0]),
  });
  const persistedSupplies =
    invoice && invSubtotal != null
      ? Math.max(0, invSubtotal - (laborCost ?? 0) - (partsCost ?? 0))
      : null;
  const shopSuppliesTotal = invoice
    ? persistedSupplies && persistedSupplies > 0
      ? persistedSupplies
      : null
    : shopSupplies.amount > 0
      ? shopSupplies.amount
      : null;
  const configuredTaxRate = Math.max(0, safeNumber(shop?.tax_rate));
  const calculated = calculateInvoiceTotals({
    laborCost: laborCost ?? 0,
    partsCost: partsCost ?? 0,
    shopSuppliesTotal,
    discountTotal: invDiscount,
    taxRatePercent: configuredTaxRate,
  });
  const subtotal = invoice
    ? invSubtotal ?? calculated.subtotal
    : calculated.subtotal > 0
      ? calculated.subtotal
      : null;
  const taxTotal = invoice ? invTax : calculated.taxTotal;
  const persistedTaxableBase = Math.max((subtotal ?? 0) - invDiscount, 0);
  const taxRate =
    invoice && persistedTaxableBase > 0
      ? (taxTotal / persistedTaxableBase) * 100
      : configuredTaxRate;
  const derivedInvoiceTotal = calculateInvoiceTotals({
    laborCost: laborCost ?? 0,
    partsCost: partsCost ?? 0,
    shopSuppliesTotal,
    discountTotal: invDiscount,
    taxRatePercent: taxRate,
  }).total;
  const total = invoice
    ? invTotal ?? derivedInvoiceTotal
    : derivedInvoiceTotal > 0
      ? derivedInvoiceTotal
      : woInvoiceTotal;

  return {
    workOrder,
    invoice: invoice ?? null,
    shop: shop ?? null,
    customer: customer ?? null,
    vehicle: vehicle ?? null,
    lines: pricedLines,
    parts,
    currency,
    laborCost,
    partsCost,
    shopSuppliesTotal,
    subtotal,
    discountTotal: invDiscount > 0 ? invDiscount : null,
    taxTotal: taxTotal > 0 ? taxTotal : null,
    taxRate: taxRate > 0 ? taxRate : null,
    total,
  };
}
