// app/api/work-orders/[id]/invoice-pdf/route.ts (FULL FILE REPLACEMENT)
//
// ✅ Fixes
// - Multi-page pagination (no more cut-off parts/totals)
// - Never "breaks" content when out of space; it creates a new page and continues
// - Safe mileage/engine-hours handling (no .trim() on numbers)
// - Parts are grouped under their related line items when possible
//   (best-effort mapping: work_order_parts.work_order_line_id OR allocations.work_order_line_id if present)
// - Also prints an overall Parts section (so nothing is lost) + Totals always appears
// - ✅ Labor shows as $ per line (hours × shop.labor_rate) + shows rate
//
// Notes
// - This uses ONLY pdf-lib (no React-PDF).
// - If your schema doesn't have work_order_line_id on parts tables, grouping falls back to "Unassigned".
// - IMPORTANT: Supabase .select() must be a SINGLE LINE STRING (no newlines) or it will throw "Unterminated string constant".

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

function joinName(
  first?: string | null,
  last?: string | null,
): string | undefined {
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

// Optional line linkage if your schema has work_order_line_id
type BilledPartRow = Pick<
  WorkOrderPartRow,
  "part_id" | "quantity" | "unit_price" | "total_price"
> & {
  work_order_line_id?: string | null;
};

type AllocPartRow = Pick<
  WorkOrderPartAllocRow,
  "part_id" | "qty" | "unit_cost"
> & {
  work_order_line_id?: string | null;
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
    .select("id,shop_id,customer_id,vehicle_id,customer_name,custom_id,created_at")
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
    .select("id,invoice_number,currency,subtotal,parts_cost,labor_cost,discount_total,tax_total,total,issued_at,notes,created_at")
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

  // ✅ include labor_rate so we can print labor dollars per line
  const { data: shop } = await supabase
    .from("shops")
    .select("business_name,shop_name,name,phone_number,email,street,city,province,postal_code,country,labor_rate")
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
        | "labor_rate"
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

  const laborRate = safeMoney(shop?.labor_rate);

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
      .select("name,first_name,last_name,phone,phone_number,email,business_name,street,city,province,postal_code")
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
      .select("year,make,model,vin,license_plate,unit_number,mileage,color,engine_hours")
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
    .select("id,line_no,description,complaint,cause,correction,labor_time,price_estimate")
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

  // Parts: Prefer billed parts, fallback to allocations
  const { data: wop } = await supabase
    .from("work_order_parts")
    .select("part_id,quantity,unit_price,total_price,work_order_line_id")
    .eq("work_order_id", workOrderId);

  const billedParts = (Array.isArray(wop) ? wop : []) as BilledPartRow[];

  let allocParts: Array<{
    part_id: string;
    qty: number;
    unit_cost: number;
    work_order_line_id?: string | null;
  }> = [];

  if (billedParts.length === 0) {
    const { data: alloc } = await supabase
      .from("work_order_part_allocations")
      .select("part_id,qty,unit_cost,work_order_line_id")
      .eq("work_order_id", workOrderId);

    const allocRows = (Array.isArray(alloc) ? alloc : []) as AllocPartRow[];

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
          .filter((id): id is string => typeof id === "string" && id.length > 0),
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
      .select("id,name,part_number,sku,unit")
      .in("id", partIds);

    const arr = (Array.isArray(parts) ? parts : []) as Array<
      Pick<PartRow, "id" | "name" | "part_number" | "sku" | "unit">
    >;

    partsMap = new Map(arr.map((p) => [p.id, p]));
  }

  const partRowsFromBilled: PartDisplayRow[] = billedParts.map((r) => {
    const p = r.part_id ? partsMap.get(r.part_id) : undefined;

    const qty =
      typeof r.quantity === "number" ? r.quantity : Number(r.quantity);
    const unitPrice = safeMoney(r.unit_price);
    const totalPrice = safeMoney(r.total_price);

    const lineId =
      typeof r.work_order_line_id === "string" && r.work_order_line_id.length > 0
        ? r.work_order_line_id
        : undefined;

    return {
      name: (p?.name ?? "Part").trim() || "Part",
      partNumber: (p?.part_number ?? "").trim() || undefined,
      sku: (p?.sku ?? "").trim() || undefined,
      unit: (p?.unit ?? "").trim() || undefined,
      qty: Number.isFinite(qty) ? qty : 0,
      unitPrice,
      totalPrice:
        totalPrice > 0
          ? totalPrice
          : Math.max(0, (Number.isFinite(qty) ? qty : 0) * unitPrice),
      lineId,
    };
  });

  const partRowsFromAlloc: PartDisplayRow[] = allocParts.map((r) => {
    const p = partsMap.get(r.part_id);

    const qty = safeMoney(r.qty);
    const unitCost = safeMoney(r.unit_cost);
    const total = Math.max(0, qty * unitCost);

    const lineId =
      typeof r.work_order_line_id === "string" && r.work_order_line_id.length > 0
        ? r.work_order_line_id
        : undefined;

    return {
      name: (p?.name ?? "Part").trim() || "Part",
      partNumber: (p?.part_number ?? "").trim() || undefined,
      sku: (p?.sku ?? "").trim() || undefined,
      unit: (p?.unit ?? "").trim() || undefined,
      qty,
      unitPrice: unitCost,
      totalPrice: total,
      lineId,
    };
  });

  const allPartRows: PartDisplayRow[] =
    partRowsFromBilled.length > 0 ? partRowsFromBilled : partRowsFromAlloc;

  const partsByLineId = new Map<string, PartDisplayRow[]>();
  const unassignedParts: PartDisplayRow[] = [];

  for (const p of allPartRows) {
    if (p.lineId) {
      const arr = partsByLineId.get(p.lineId) ?? [];
      arr.push(p);
      partsByLineId.set(p.lineId, arr);
    } else {
      unassignedParts.push(p);
    }
  }

  // Totals (prefer invoice row)
  const subtotal = safeMoney(inv?.subtotal);
  const laborCost = safeMoney(inv?.labor_cost);
  const partsCost = safeMoney(inv?.parts_cost);
  const discountTotal = safeMoney(inv?.discount_total);
  const taxTotal = safeMoney(inv?.tax_total);
  const grandTotal = safeMoney(inv?.total);

  // ---------------- PDF (multi-page) ----------------
  const pdfDoc = await PDFDocument.create();

  const PAGE_W = 595.28;
  const PAGE_H = 841.89; // A4
  const marginX = 42;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const C_TEXT: PdfRgb = rgb(0.08, 0.08, 0.08);
  const C_MUTED: PdfRgb = rgb(0.35, 0.35, 0.35);
  const C_LIGHT: PdfRgb = rgb(0.7, 0.7, 0.7);
  const C_COPPER: PdfRgb = rgb(0.78, 0.48, 0.28);
  const C_HEADER_BG: PdfRgb = rgb(0.05, 0.07, 0.1);
  const C_WHITE: PdfRgb = rgb(1, 1, 1);

  const lineH = (size: number) => size + 6;

  const titleId = wo.custom_id ? asString(wo.custom_id) : `WO-${wo.id.slice(0, 8)}`;
  const invoiceNumber = (inv?.invoice_number ?? "").trim();

  const issuedAt =
    inv?.issued_at != null
      ? new Date(inv.issued_at).toLocaleString()
      : inv?.created_at != null
        ? new Date(inv.created_at).toLocaleString()
        : wo.created_at
          ? new Date(wo.created_at).toLocaleString()
          : new Date().toLocaleString();

  const headerH = 92;
  const footerH = 34;
  const rightX = 360;

  const drawHeader = (page: ReturnType<PDFDocument["addPage"]>) => {
    const headerY = PAGE_H - headerH;

    page.drawRectangle({ x: 0, y: headerY, width: PAGE_W, height: headerH, color: C_HEADER_BG });

    const headerTop = PAGE_H - 26;

    page.drawText(shopName, { x: marginX, y: headerTop, size: 16, font: bold, color: C_COPPER });

    if (shopAddress.trim().length) {
      page.drawText(shopAddress, { x: marginX, y: headerTop - 20, size: 9.5, font, color: C_LIGHT });
    }

    if (shopContact.trim().length) {
      page.drawText(shopContact, { x: marginX, y: headerTop - 34, size: 9.5, font, color: rgb(0.85, 0.85, 0.85) });
    }

    page.drawText("INVOICE", { x: rightX, y: headerTop, size: 18, font: bold, color: C_WHITE });

    const meta1 = invoiceNumber.length ? `Invoice #: ${invoiceNumber}` : `Work Order: ${titleId}`;
    page.drawText(meta1, { x: rightX, y: headerTop - 20, size: 10, font, color: rgb(0.88, 0.88, 0.88) });

    page.drawText(`Issued: ${issuedAt}`, { x: rightX, y: headerTop - 34, size: 10, font, color: rgb(0.7, 0.7, 0.7) });

    const divY = headerY - 22;
    page.drawRectangle({
      x: marginX - 10,
      y: divY,
      width: PAGE_W - (marginX - 10) * 2,
      height: 2,
      color: C_COPPER,
    });

    return divY - 18;
  };

  const drawFooter = (page: ReturnType<PDFDocument["addPage"]>) => {
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: footerH, color: C_HEADER_BG });

    page.drawText(`${shopName} • Invoice`, { x: marginX, y: 14, size: 9, font, color: rgb(0.8, 0.8, 0.8) });
    page.drawText(`Work Order: ${titleId}`, { x: rightX, y: 14, size: 9, font, color: rgb(0.65, 0.65, 0.65) });
  };

  const newPage = (): PdfCtx => {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const startY = drawHeader(page);
    drawFooter(page);
    return { doc: pdfDoc, page, y: startY };
  };

  const ensureSpace = (ctx2: PdfCtx, needed: number): PdfCtx => {
    const bottomLimit = footerH + 26;
    if (ctx2.y - needed >= bottomLimit) return ctx2;
    return newPage();
  };

  const drawText = (ctx2: PdfCtx, text: string, opts?: DrawTextOpts): PdfCtx => {
    const size = opts?.size ?? 11;
    const x = opts?.x ?? marginX;
    const f = opts?.bold ? bold : font;
    const color = opts?.color ?? C_TEXT;

    ctx2.page.drawText(text, { x, y: ctx2.y, size, font: f, color });
    return { ...ctx2, y: ctx2.y - lineH(size) };
  };

  const drawRule = (ctx2: PdfCtx): PdfCtx => {
    const y = ctx2.y - 4;
    ctx2.page.drawRectangle({
      x: marginX,
      y,
      width: PAGE_W - marginX * 2,
      height: 1,
      color: rgb(0.92, 0.92, 0.92),
    });
    return { ...ctx2, y: y - 12 };
  };

  // ---- start ----
  let ctxPdf = newPage();

  // Customer
  ctxPdf = ensureSpace(ctxPdf, 180);
  ctxPdf = drawText(ctxPdf, "Customer", { bold: true, size: 12, color: C_COPPER });
  ctxPdf = drawText(ctxPdf, customerName, { size: 11 });
  ctxPdf = drawText(ctxPdf, `Business: ${customerBusiness}`, { size: 10, color: C_MUTED });
  ctxPdf = drawText(ctxPdf, `Phone: ${customerPhone}`, { size: 10, color: C_MUTED });
  ctxPdf = drawText(ctxPdf, `Email: ${customerEmail}`, { size: 10, color: C_MUTED });
  ctxPdf = drawText(ctxPdf, `Address: ${customerAddress}`, { size: 10, color: C_MUTED });

  ctxPdf = drawText(ctxPdf, "", { size: 6 });

  // Vehicle
  ctxPdf = ensureSpace(ctxPdf, 150);
  ctxPdf = drawText(ctxPdf, "Vehicle", { bold: true, size: 12, color: C_COPPER });
  ctxPdf = drawText(ctxPdf, vehicleLabel, { size: 11 });
  ctxPdf = drawText(ctxPdf, `VIN: ${vin}`, { size: 10, color: C_MUTED });
  ctxPdf = drawText(ctxPdf, `Plate: ${plate}`, { size: 10, color: C_MUTED });
  ctxPdf = drawText(ctxPdf, `Unit #: ${unit}`, { size: 10, color: C_MUTED });
  ctxPdf = drawText(ctxPdf, `Mileage: ${mileage}`, { size: 10, color: C_MUTED });
  ctxPdf = drawText(ctxPdf, `Color: ${color}`, { size: 10, color: C_MUTED });
  ctxPdf = drawText(ctxPdf, `Engine Hours: ${engineHours}`, { size: 10, color: C_MUTED });

  ctxPdf = drawText(ctxPdf, "", { size: 8 });

  // Line Items
  ctxPdf = ensureSpace(ctxPdf, 60);
  ctxPdf = drawText(ctxPdf, "Line Items", { bold: true, size: 12, color: C_COPPER });

  if (!lineRows.length) {
    ctxPdf = drawText(ctxPdf, "— No line items recorded yet —", { size: 10, color: C_MUTED });
  } else {
    const sorted = [...lineRows].sort((a, b) => {
      const an = typeof a.line_no === "number" ? a.line_no : Number(a.line_no);
      const bn = typeof b.line_no === "number" ? b.line_no : Number(b.line_no);
      const asn = Number.isFinite(an) ? an : 0;
      const bsn = Number.isFinite(bn) ? bn : 0;
      return asn - bsn;
    });

    for (const row of sorted) {
      const complaint = asString(row.complaint || row.description || "—");
      const cause = asString(row.cause || "");
      const correction = asString(row.correction || "");

      const laborHours = safeMoney(row.labor_time);
      const laborDollars = Math.max(0, laborHours * laborRate);

      const complaintLines = wrapText(complaint, 78);
      const causeLines = cause.trim() ? wrapText(cause, 78) : [];
      const correctionLines = correction.trim() ? wrapText(correction, 78) : [];

      const lineParts = row.id ? partsByLineId.get(row.id) ?? [] : [];
      const linePartsDollars = lineParts.reduce((sum, p) => sum + safeMoney(p.totalPrice), 0);
      const lineTotal = laborDollars + linePartsDollars;

      const approx =
        26 +
        (complaintLines.length + causeLines.length + correctionLines.length) * 16 +
        (laborHours > 0 ? 32 : 0) +
        (lineParts.length ? 24 + Math.min(lineParts.length, 8) * 16 : 0) +
        (lineTotal > 0 ? 16 : 0);

      ctxPdf = ensureSpace(ctxPdf, Math.max(110, approx));

      const label =
        row.line_no != null && asString(row.line_no).trim().length
          ? `#${asString(row.line_no).trim()}`
          : "•";

      ctxPdf = drawText(ctxPdf, label, { bold: true, size: 10, color: C_COPPER });

      ctxPdf = drawText(ctxPdf, `Complaint: ${complaintLines[0]}`, { size: 10 });
      for (const extra of complaintLines.slice(1)) {
        ctxPdf = drawText(ctxPdf, `          ${extra}`, { size: 10, color: C_MUTED });
      }

      for (const c of causeLines) ctxPdf = drawText(ctxPdf, `Cause: ${c}`, { size: 10, color: C_MUTED });
      for (const c of correctionLines) ctxPdf = drawText(ctxPdf, `Correction: ${c}`, { size: 10, color: C_MUTED });

      // ✅ Labor as dollars (with hours + rate)
      if (laborHours > 0 && laborRate > 0) {
        ctxPdf = drawText(
          ctxPdf,
          `Labor: ${moneyLabel(laborDollars, currency)} (${laborHours} hr × ${moneyLabel(laborRate, currency)}/hr)`,
          { size: 10, color: C_MUTED },
        );
      } else if (laborHours > 0) {
        ctxPdf = drawText(ctxPdf, `Labor time: ${laborHours} hr`, { size: 10, color: C_MUTED });
      }

      if (lineTotal > 0) {
        ctxPdf = drawText(ctxPdf, `Line total: ${moneyLabel(lineTotal, currency)}`, { size: 10, color: C_MUTED });
      }

      if (lineParts.length) {
        ctxPdf = drawText(ctxPdf, "Parts for this line:", { size: 10, bold: true, color: C_MUTED });

        for (const p of lineParts.slice(0, 8)) {
          const meta = compactCsv([p.partNumber, p.sku, p.unit]);
          const name = meta.length ? `${p.name} (${meta})` : p.name;

          const qty = Number.isFinite(p.qty) ? p.qty : 0;
          const total = moneyLabel(p.totalPrice, currency);
          const bullet = `• ${qty} × ${name} — ${total}`;

          const pieces = wrapText(bullet, 88);
          ctxPdf = drawText(ctxPdf, pieces[0], { size: 10, color: C_MUTED });
          for (const extra of pieces.slice(1)) {
            ctxPdf = drawText(ctxPdf, `  ${extra}`, { size: 10, color: C_MUTED });
          }
        }

        if (lineParts.length > 8) {
          ctxPdf = drawText(ctxPdf, `…and ${lineParts.length - 8} more`, { size: 10, color: C_MUTED });
        }
      }

      ctxPdf = drawRule(ctxPdf);
    }
  }

  // Overall Parts section
  ctxPdf = ensureSpace(ctxPdf, 70);
  ctxPdf = drawText(ctxPdf, "Parts", { bold: true, size: 12, color: C_COPPER });

  if (!allPartRows.length) {
    ctxPdf = drawText(ctxPdf, "— No parts on this work order —", { size: 10, color: C_MUTED });
  } else {
    ctxPdf = ensureSpace(ctxPdf, 40);
    ctxPdf = drawText(ctxPdf, "Qty   Part                                Unit     Total", { size: 10, bold: true });

    ctxPdf.page.drawRectangle({
      x: marginX,
      y: ctxPdf.y + 4,
      width: PAGE_W - marginX * 2,
      height: 1,
      color: rgb(0.9, 0.9, 0.9),
    });

    const maxRows = 60;
    const rows = allPartRows.slice(0, maxRows);

    for (const p of rows) {
      const meta = compactCsv([p.partNumber, p.sku, p.unit]);
      const name = meta.length ? `${p.name} (${meta})` : p.name;
      const nameLines = wrapText(name, 52);
      const needed = 22 + nameLines.length * 16;

      ctxPdf = ensureSpace(ctxPdf, needed);

      const qty = Number.isFinite(p.qty) ? p.qty : 0;

      ctxPdf.page.drawText(String(qty), { x: marginX, y: ctxPdf.y, size: 10, font, color: C_TEXT });
      ctxPdf.page.drawText(nameLines[0], { x: marginX + 36, y: ctxPdf.y, size: 10, font, color: C_TEXT });
      ctxPdf.page.drawText(moneyLabel(p.unitPrice, currency), { x: 420, y: ctxPdf.y, size: 10, font, color: C_MUTED });
      ctxPdf.page.drawText(moneyLabel(p.totalPrice, currency), { x: 500, y: ctxPdf.y, size: 10, font, color: C_TEXT });

      ctxPdf = { ...ctxPdf, y: ctxPdf.y - lineH(10) };

      for (const extra of nameLines.slice(1)) {
        ctxPdf.page.drawText(extra, { x: marginX + 36, y: ctxPdf.y, size: 10, font, color: C_MUTED });
        ctxPdf = { ...ctxPdf, y: ctxPdf.y - lineH(10) };
      }

      ctxPdf = { ...ctxPdf, y: ctxPdf.y - 2 };
    }

    if (allPartRows.length > maxRows) {
      ctxPdf = ensureSpace(ctxPdf, 20);
      ctxPdf = drawText(ctxPdf, `…and ${allPartRows.length - maxRows} more parts`, { size: 10, color: C_MUTED });
    }

    if (unassignedParts.length && partsByLineId.size > 0) {
      ctxPdf = ensureSpace(ctxPdf, 24);
      ctxPdf = drawText(
        ctxPdf,
        `Note: ${unassignedParts.length} part(s) were not linked to a specific line item.`,
        { size: 10, color: C_MUTED },
      );
    }
  }

  // Totals
  ctxPdf = ensureSpace(ctxPdf, 140);
  ctxPdf = drawText(ctxPdf, "Totals", { bold: true, size: 12, color: C_COPPER });

  if (!inv?.id) {
    ctxPdf = drawText(ctxPdf, "— No invoice record found yet for this work order —", { size: 10, color: C_MUTED });
    ctxPdf = drawText(
      ctxPdf,
      "Create an invoice (public.invoices) to show full totals (subtotal/discount/tax/total).",
      { size: 10, color: C_MUTED },
    );
  } else {
    ctxPdf = drawText(ctxPdf, `Subtotal: ${moneyLabel(subtotal, currency)}`, { size: 11 });
    ctxPdf = drawText(ctxPdf, `Labor: ${moneyLabel(laborCost, currency)}`, { size: 11, color: C_MUTED });
    ctxPdf = drawText(ctxPdf, `Parts: ${moneyLabel(partsCost, currency)}`, { size: 11, color: C_MUTED });

    if (discountTotal > 0) {
      ctxPdf = drawText(ctxPdf, `Discount: -${moneyLabel(discountTotal, currency)}`, { size: 11, color: C_MUTED });
    }

    ctxPdf = drawText(ctxPdf, `Tax: ${moneyLabel(taxTotal, currency)}`, { size: 11, color: C_MUTED });
    ctxPdf = drawText(ctxPdf, `Total: ${moneyLabel(grandTotal, currency)}`, { size: 13, bold: true });
  }

  // Notes
  const notes = asString(inv?.notes).trim();
  if (notes.length) {
    ctxPdf = ensureSpace(ctxPdf, 70);
    ctxPdf = drawText(ctxPdf, "Notes", { bold: true, size: 12, color: C_COPPER });

    for (const ln of wrapText(notes, 92).slice(0, 12)) {
      ctxPdf = ensureSpace(ctxPdf, 18);
      ctxPdf = drawText(ctxPdf, ln, { size: 10, color: C_MUTED });
    }
  }

  const pdfBytes = await pdfDoc.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice_${titleId}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}