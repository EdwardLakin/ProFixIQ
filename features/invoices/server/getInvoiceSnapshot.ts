import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { resolveWorkOrderLinePricing } from "@/features/work-orders/lib/pricing/resolveWorkOrderLinePricing";
import {
  calculateShopSupplies,
  resolveShopSuppliesOverride,
  resolveShopSuppliesSettings,
} from "@/features/work-orders/lib/shopSupplies";

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
  "id" | "line_no" | "description" | "complaint" | "cause" | "correction" | "labor_time"
> & { labor_total?: number | null };

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

function itemUnitPrice(item: Pick<PartRequestItemRow, "quoted_price" | "unit_price" | "unit_cost">): number {
  // Phase 5D quote sync treats quoted_price as the unit sell price, then falls back
  // to unit_price and unit_cost. Preserve that unit-price interpretation here.
  return safeNumberOrNull(item.quoted_price) ?? safeNumberOrNull(item.unit_price) ?? safeNumberOrNull(item.unit_cost) ?? 0;
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
      "id, shop_id, customer_id, vehicle_id, customer_name, custom_id, labor_total, parts_total, invoice_total, created_at",
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

  const { data: shop } = await supabase
    .from("shops")
    .select(
      "business_name, shop_name, name, country, phone_number, email, street, city, province, postal_code, labor_rate, supplies_percent, shop_supplies_enabled, shop_supplies_type, shop_supplies_percent, shop_supplies_flat_amount, shop_supplies_cap_amount",
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
      >
    >();

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

  const { data: linesRaw } = await supabase
    .from("work_order_lines")
    .select("id, line_no, description, complaint, cause, correction, labor_time, labor_total")
    .eq("shop_id", workOrder.shop_id)
    .eq("work_order_id", workOrderId)
    .order("line_no", { ascending: true })
    .returns<InvoiceSnapshotLine[]>();

  const lines = Array.isArray(linesRaw) ? linesRaw : [];

  const { data: allocRaw } = await supabase
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

  const allocs = Array.isArray(allocRaw) ? allocRaw : [];
  const { data: stagedPartsRaw } = await supabase
    .from("work_order_parts")
    .select("id, shop_id, work_order_line_id, part_id, quantity, unit_price, total_price")
    .eq("shop_id", workOrder.shop_id)
    .eq("work_order_id", workOrderId)
    .returns<
      Array<
        Pick<WorkOrderPartRow, "id" | "shop_id" | "work_order_line_id" | "part_id" | "quantity" | "unit_price" | "total_price">
      >
    >();
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

  const { data: requestItemsRaw } = await supabase
    .from("part_request_items")
    .select("id, request_id, shop_id, work_order_id, work_order_line_id, quote_line_id, description, qty, qty_requested, qty_approved, quoted_price, unit_price, unit_cost, status, approved, part_id, vendor")
    .eq("shop_id", workOrder.shop_id)
    .eq("work_order_id", workOrderId)
    .not("work_order_line_id", "is", null)
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
    Pick<PartRow, "id" | "name" | "sku" | "part_number" | "unit">
  >();

  if (partIds.length > 0) {
    const { data: partRows } = await supabase
      .from("parts")
      .select("id, name, sku, part_number, unit")
      .eq("shop_id", workOrder.shop_id)
      .in("id", partIds)
      .returns<Array<Pick<PartRow, "id" | "name" | "sku" | "part_number" | "unit">>>();

    for (const p of Array.isArray(partRows) ? partRows : []) {
      if (isNonEmptyString(p.id)) partsMap.set(p.id, p);
    }
  }

  const allocationParts: InvoiceSnapshotPart[] = allocs.map((a) => {
    const p = isNonEmptyString(a.part_id) ? partsMap.get(a.part_id) : undefined;
    const qtyRaw = safeNumber(a.qty);
    const qty = qtyRaw > 0 ? qtyRaw : 1;
    const unitPrice = safeNumber(a.unit_cost);
    const totalPrice = Math.max(0, qty * unitPrice);
    const lidRaw = a.work_order_line_id;
    const lineId = isNonEmptyString(lidRaw) ? lidRaw.trim() : undefined;

    return {
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
    };
  });

  const stagedInvoiceParts: InvoiceSnapshotPart[] = stagedParts.map((part) => {
    const p = isNonEmptyString(part.part_id) ? partsMap.get(part.part_id) : undefined;
    const qtyRaw = safeNumber(part.quantity);
    const qty = qtyRaw > 0 ? qtyRaw : 1;
    const totalRaw = safeNumber(part.total_price);
    const unitPrice = safeNumber(part.unit_price);
    const totalPrice = totalRaw > 0 ? totalRaw : Math.max(0, qty * unitPrice);
    const lineId = isNonEmptyString(part.work_order_line_id)
      ? part.work_order_line_id.trim()
      : undefined;

    return {
      id: String(part.id),
      lineId,
      name: (p?.name ?? "Part").trim() || "Part",
      qty,
      unitPrice,
      totalPrice,
      sku: (p?.sku ?? "").trim() || undefined,
      partNumber: (p?.part_number ?? "").trim() || undefined,
      unit: (p?.unit ?? "").trim() || undefined,
      source: "work_order_part",
    };
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

  const parts: InvoiceSnapshotPart[] = [...allocationParts];
  for (const line of lines) {
    const lineAllocations = byLineAlloc.get(line.id) ?? [];
    if (lineAllocations.length > 0) continue;

    const lineStaged = stagedPartsByLineForDisplay.get(line.id) ?? [];
    if (lineStaged.length > 0) {
      parts.push(...lineStaged);
      continue;
    }

    parts.push(...(fallbackPartsByLineForDisplay.get(line.id) ?? []));
  }

  const currency =
    normalizeInvoiceCurrency(invoice?.currency) ??
    normalizeCurrencyFromCountry(shop?.country);

  const invSubtotal = positiveOrNull(invoice?.subtotal);
  const invLabor = positiveOrNull(invoice?.labor_cost);
  const invParts = positiveOrNull(invoice?.parts_cost);
  const invTotal = positiveOrNull(invoice?.total);
  const invDiscount = safeNumber(invoice?.discount_total);
  const invTax = safeNumber(invoice?.tax_total);

  const woLabor = positiveOrNull(workOrder.labor_total);
  const woParts = positiveOrNull(workOrder.parts_total);
  const woInvoiceTotal = positiveOrNull(workOrder.invoice_total);

  const partsTotalFromSnapshotParts =
    parts.length > 0
      ? parts.reduce((acc, p) => acc + safeNumber(p.totalPrice), 0)
      : null;

  const byLineQuote = new Map<string, typeof activeQuotes[number]>();
  for (const q of activeQuotes) {
    if (!q.work_order_line_id) continue;
    byLineQuote.set(q.work_order_line_id, q);
  }

  let resolvedLabor = 0;
  let resolvedParts = 0;
  for (const line of lines) {
    const lineAllocations = byLineAlloc.get(line.id) ?? [];
    const lineStaged = byLineStaged.get(line.id) ?? [];
    const lineFallbackParts = fallbackPartsByLineForDisplay.get(line.id) ?? [];
    const stagedPricingParts =
      lineAllocations.length > 0
        ? []
        : lineStaged.length > 0
          ? lineStaged
          : lineFallbackParts.map((part) => ({
              quantity: part.qty,
              unit_price: part.unitPrice,
              total_price: part.totalPrice,
            }));

    const resolved = resolveWorkOrderLinePricing({
      line,
      quote: byLineQuote.get(line.id) ?? null,
      shopLaborRate: safeNumberOrNull(shop?.labor_rate),
      stagedParts: stagedPricingParts,
      allocatedParts: lineAllocations,
    });
    resolvedLabor += resolved.laborTotal;
    resolvedParts += resolved.partsTotal;
  }

  const laborCost = invLabor ?? (resolvedLabor > 0 ? resolvedLabor : woLabor) ?? null;
  const partsCost = invParts ?? (resolvedParts > 0 ? resolvedParts : partsTotalFromSnapshotParts ?? woParts) ?? null;

  const baseSubtotal = (laborCost ?? 0) + (partsCost ?? 0);
  const shopSupplies = calculateShopSupplies({
    baseAmount: baseSubtotal,
    settings: resolveShopSuppliesSettings(shop as Parameters<typeof resolveShopSuppliesSettings>[0]),
    override: resolveShopSuppliesOverride(workOrder as Parameters<typeof resolveShopSuppliesOverride>[0]),
  });
  const shopSuppliesTotal = shopSupplies.amount > 0 ? shopSupplies.amount : null;

  const subtotal =
    invSubtotal != null
      ? invSubtotal <= baseSubtotal + 0.005
        ? invSubtotal + shopSupplies.amount
        : invSubtotal
      : baseSubtotal + shopSupplies.amount > 0
        ? baseSubtotal + shopSupplies.amount
        : null;

  const derivedTotal =
    subtotal != null ? Math.max(0, subtotal + invTax - invDiscount) : null;
  const adjustedInvoiceTotal =
    invTotal != null && invSubtotal != null && invSubtotal <= baseSubtotal + 0.005
      ? invTotal + shopSupplies.amount
      : invTotal;

  const total = adjustedInvoiceTotal ?? woInvoiceTotal ?? derivedTotal ?? null;

  return {
    workOrder,
    invoice: invoice ?? null,
    shop: shop ?? null,
    customer: customer ?? null,
    vehicle: vehicle ?? null,
    lines,
    parts,
    currency,
    laborCost,
    partsCost,
    shopSuppliesTotal,
    subtotal,
    discountTotal: invDiscount > 0 ? invDiscount : null,
    taxTotal: invTax > 0 ? invTax : null,
    total,
  };
}
