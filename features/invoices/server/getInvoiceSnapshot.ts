import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type InvoiceRow = DB["public"]["Tables"]["invoices"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type AllocationRow = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];

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
};

export type InvoiceSnapshotLine = Pick<
  WorkOrderLineRow,
  "id" | "line_no" | "description" | "complaint" | "cause" | "correction" | "labor_time"
>;

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
      "business_name, shop_name, name, country, phone_number, email, street, city, province, postal_code, labor_rate",
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
    .select("id, line_no, description, complaint, cause, correction, labor_time")
    .eq("work_order_id", workOrderId)
    .order("line_no", { ascending: true })
    .returns<InvoiceSnapshotLine[]>();

  const lines = Array.isArray(linesRaw) ? linesRaw : [];

  const { data: allocRaw } = await supabase
    .from("work_order_part_allocations")
    .select("id, work_order_line_id, part_id, qty, unit_cost, created_at")
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: true })
    .returns<
      Array<
        Pick<
          AllocationRow,
          "id" | "work_order_line_id" | "part_id" | "qty" | "unit_cost" | "created_at"
        >
      >
    >();

  const allocs = Array.isArray(allocRaw) ? allocRaw : [];

  const partIds = Array.from(
    new Set(
      allocs
        .map((a) => a.part_id)
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
      .in("id", partIds)
      .returns<Array<Pick<PartRow, "id" | "name" | "sku" | "part_number" | "unit">>>();

    for (const p of Array.isArray(partRows) ? partRows : []) {
      if (isNonEmptyString(p.id)) partsMap.set(p.id, p);
    }
  }

  const parts: InvoiceSnapshotPart[] = allocs.map((a) => {
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
    };
  });

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

  const partsTotalFromAlloc =
    parts.length > 0
      ? parts.reduce((acc, p) => acc + safeNumber(p.totalPrice), 0)
      : null;

  const laborCost = invLabor ?? woLabor ?? null;
  const partsCost = invParts ?? partsTotalFromAlloc ?? woParts ?? null;

  const subtotal =
    invSubtotal ??
    ((laborCost ?? 0) + (partsCost ?? 0) > 0 ? (laborCost ?? 0) + (partsCost ?? 0) : null);

  const derivedTotal =
    subtotal != null ? Math.max(0, subtotal + invTax - invDiscount) : null;

  const total = invTotal ?? woInvoiceTotal ?? derivedTotal ?? null;

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
    subtotal,
    discountTotal: invDiscount > 0 ? invDiscount : null,
    taxTotal: invTax > 0 ? invTax : null,
    total,
  };
}
