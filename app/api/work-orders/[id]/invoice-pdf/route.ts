// app/api/work-orders/[id]/invoice-pdf/route.ts (FULL FILE REPLACEMENT)
//
// ✅ Fixes
// - Multi-page pagination (no more cut-off parts/totals)
// - Never "breaks" content when out of space; it creates a new page and continues
// - Safe mileage/engine-hours handling (no .trim() on numbers)
// - Parts are grouped under their related line items when possible
//   (best-effort mapping: work_order_parts.work_order_line_id OR allocations.work_order_line_id if present)
// - Also prints an overall Parts section (so nothing is lost) + Totals always appears
//
// Notes
// - This uses ONLY pdf-lib (no React-PDF).
// - If your schema doesn't have work_order_line_id on parts tables, grouping falls back to "Unassigned".

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
type InvoiceRow = DB["public"]["Tables"]["invoices"]["Row"];
type WorkOrderPartRow = DB["public"]["Tables"]["work_order_parts"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type WorkOrderPartAllocRow =
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"];

type PdfRgb = ReturnType<typeof rgb>;

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function safeMoney(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function moneyLabel(n: number, currency: "CAD" | "USD"): string {
  const val = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat(currency === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(val);
}

function wrapText(text: string, maxChars: number): string[] {
  const t = (text ?? "").trim();
  if (!t) return ["—"];
  const words = t.split(/\s+/);
  const lines: string[] = [];
  let cur = "";

  for (const w of words) {
    if (!cur) {
      cur = w;
      continue;
    }
    if ((cur + " " + w).length <= maxChars) {
      cur = cur + " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : ["—"];
}

function compactCsv(parts: Array<string | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0)
    .join(", ");
}

function joinName(first?: string | null, last?: string | null): string | undefined {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const s = [f, l].filter(Boolean).join(" ").trim();
  return s.length ? s : undefined;
}

function pickCustomerName(
  c?: Pick<CustomerRow, "name" | "first_name" | "last_name"> | null,
  fallback?: string | null,
): string | undefined {
  const a = (c?.name ?? "").trim();
  const b = joinName(c?.first_name ?? null, c?.last_name ?? null);
  const f = (fallback ?? "").trim();
  const out = a || b || f;
  return out.length ? out : undefined;
}

function pickCustomerPhone(
  c?: Pick<CustomerRow, "phone" | "phone_number"> | null,
): string | undefined {
  const p1 = (c?.phone_number ?? "").trim();
  const p2 = (c?.phone ?? "").trim();
  const out = p1 || p2;
  return out.length ? out : undefined;
}

function pickShopName(
  s?: Pick<ShopRow, "business_name" | "shop_name" | "name"> | null,
): string | undefined {
  const a = (s?.business_name ?? "").trim();
  const b = (s?.shop_name ?? "").trim();
  const c = (s?.name ?? "").trim();
  const out = a || b || c;
  return out.length ? out : undefined;
}

function currencyFromInvoice(v: unknown): "CAD" | "USD" | null {
  const c = String(v ?? "").trim().toUpperCase();
  if (c === "CAD") return "CAD";
  if (c === "USD") return "USD";
  return null;
}

function currencyFromShopCountry(country: unknown): "CAD" | "USD" {
  const c = String(country ?? "").trim().toUpperCase();
  return c === "CA" ? "CAD" : "USD";
}

type PartDisplayRow = {
  name: string;
  partNumber?: string;
  sku?: string;
  unit?: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;

  // optional mapping to line
  lineId?: string;
};

type DrawTextOpts = {
  size?: number;
  bold?: boolean;
  x?: number;
  color?: PdfRgb;
};

type PdfCtx = {
  doc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  y: number;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workOrderId } = await ctx.params;
  if (!workOrderId) {
    return NextResponse.json(
      { error: "Missing work order id" },
      { status: 400 },
    );
  }

  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, shop_id, customer_id, vehicle_id, customer_name, custom_id, created_at")
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
        | "created_at"
      >
    >();

  if (woErr || !wo?.id) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, currency, subtotal, parts_cost, labor_cost, discount_total, tax_total, total, issued_at, notes, created_at",
    )
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<
      Pick<
        InvoiceRow,
        | "id"
        | "invoice_number"
        | "currency"
        | "subtotal"
        | "parts_cost"
        | "labor_cost"
        | "discount_total"
        | "tax_total"
        | "total"
        | "issued_at"
        | "notes"
        | "created_at"
      >
    >();

  if (invErr) {
    console.warn("[invoice-pdf] invoices query failed", invErr.message);
  }

  const { data: shop } = await supabase
    .from("shops")
    .select(
      "business_name, shop_name, name, phone_number, email, street, city, province, postal_code, country",
    )
    .eq("id", wo.shop_id)
    .maybeSingle<
      Pick<
        ShopRow,
        | "business_name"
        | "shop_name"
        | "name"
        | "phone_number"
        | "email"
        | "street"
        | "city"
        | "province"
        | "postal_code"
        | "country"
      >
    >();

  const shopName = pickShopName(shop ?? null) ?? "ProFixIQ";
  const shopAddress = compactCsv([
    (shop?.street ?? "").trim() || undefined,
    (shop?.city ?? "").trim() || undefined,
    (shop?.province ?? "").trim() || undefined,
    (shop?.postal_code ?? "").trim() || undefined,
  ]);
  const shopContact = compactCsv([
    (shop?.phone_number ?? "").trim() || undefined,
    (shop?.email ?? "").trim() || undefined,
  ]);

  const currency: "CAD" | "USD" =
    currencyFromInvoice(inv?.currency) ?? currencyFromShopCountry(shop?.country);

  // Customer
  let customer:
    | Pick<
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
    | null = null;

  if (wo.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select(
        "name,first_name,last_name,phone,phone_number,email,business_name,street,city,province,postal_code",
      )
      .eq("id", wo.customer_id)
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
      >();
    customer = c ?? null;
  }

  const customerName =
    pickCustomerName(customer ?? null, wo.customer_name ?? null) ?? "—";
  const customerPhone = pickCustomerPhone(customer ?? null) ?? "—";
  const customerEmail = (customer?.email ?? "").trim() || "—";
  const customerBusiness = (customer?.business_name ?? "").trim() || "—";
  const customerAddress =
    compactCsv([
      (customer?.street ?? "").trim() || undefined,
      (customer?.city ?? "").trim() || undefined,
      (customer?.province ?? "").trim() || undefined,
      (customer?.postal_code ?? "").trim() || undefined,
    ]) || "—";

  // Vehicle
  let vehicle:
    | Pick<
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
    | null = null;

  if (wo.vehicle_id) {
    const { data: v } = await supabase
      .from("vehicles")
      .select(
        "year,make,model,vin,license_plate,unit_number,mileage,color,engine_hours",
      )
      .eq("id", wo.vehicle_id)
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
      >();
    vehicle = v ?? null;
  }

  const vehicleLabel =
    compactCsv([
      vehicle?.year != null ? String(vehicle.year) : undefined,
      (vehicle?.make ?? "").trim() || undefined,
      (vehicle?.model ?? "").trim() || undefined,
    ]) || "—";

  const vin = (vehicle?.vin ?? "").trim() || "—";
  const plate = (vehicle?.license_plate ?? "").trim() || "—";
  const unit = (vehicle?.unit_number ?? "").trim() || "—";
  const mileage = asString(vehicle?.mileage).trim() || "—";
  const color = (vehicle?.color ?? "").trim() || "—";
  const engineHours = asString(vehicle?.engine_hours).trim() || "—";

  // Lines
  const { data: lines } = await supabase
    .from("work_order_lines")
    .select("id, line_no, description, complaint, cause, correction, labor_time, price_estimate")
    .eq("work_order_id", workOrderId)
    .order("line_no", { ascending: true });

  const lineRows = (Array.isArray(lines) ? lines : []) as Array<
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
    >
  >;

  // -------------------------------------------------------------------
  // Parts: Prefer work_order_parts (billed parts). Fallback to allocations.
  // Best-effort grouping by line id if the column exists.
  // -------------------------------------------------------------------

  // For grouping, we attempt to select work_order_line_id too.
  const { data: wop } = await supabase
    .from("work_order_parts")
    .select("part_id, quantity, unit_price, total_price, work_order_line_id")
    .eq("work_order_id", workOrderId);

  const billedParts = (Array.isArray(wop) ? wop : []) as Array<
    Pick<WorkOrderPartRow, "part_id" | "quantity" | "unit_price" | "total_price"> & {
      work_order_line_id?: string | null;
    }
  >;

  let allocParts: Array<{
    part_id: string;
    qty: number;
    unit_cost: number;
    work_order_line_id?: string | null;
  }> = [];

  if (billedParts.length === 0) {
    const { data: alloc } = await supabase
      .from("work_order_part_allocations")
      .select("part_id, qty, unit_cost, work_order_line_id")
      .eq("work_order_id", workOrderId);

    const allocRows = (Array.isArray(alloc) ? alloc : []) as Array<
      Pick<WorkOrderPartAllocRow, "part_id" | "qty" | "unit_cost"> & {
        work_order_line_id?: string | null;
      }
    >;

    allocParts = allocRows
      .filter((r) => typeof r.part_id === "string" && r.part_id.length > 0)
      .map((r) => ({
        part_id: r.part_id as string,
        qty: safeMoney(r.qty),
        unit_cost: safeMoney(r.unit_cost),
        work_order_line_id:
          typeof r.work_order_line_id === "string" ? r.work_order_line_id : null,
      }));
  }

  const partIds = Array.from(
    new Set(
      [
        ...billedParts
          .map((r) => r.part_id)
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
        ...allocParts.map((r) => r.part_id),
      ].filter(Boolean),
    ),
  );

  let partsMap = new Map<
    string,
    Pick<PartRow, "id" | "name" | "part_number" | "sku" | "unit">
  >();
  if (partIds.length > 0) {
    const { data: parts } = await supabase
      .from("parts")
      .select("id,
        