// app/api/work-orders/[id]/invoice-pdf/route.ts
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

function normalizeInvoiceCurrency(v: unknown): "CAD" | "USD" {
  const c = String(v ?? "").trim().toUpperCase();
  return c === "CAD" ? "CAD" : "USD";
}

type PartDisplayRow = {
  name: string;
  partNumber?: string;
  sku?: string;
  unit?: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // Auth check (preventsS (prevents “random public invoice pdf”)
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workOrderId } = await ctx.params;
  if (!workOrderId) {
    return NextResponse.json({ error: "Missing work order id" }, { status: 400 });
  }

  // Load WO (light)
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, shop_id, customer_id, vehicle_id, customer_name, custom_id, created_at")
    .eq("id", workOrderId)
    .maybeSingle<
      Pick<
        WorkOrderRow,
        "id" | "shop_id" | "customer_id" | "vehicle_id" | "customer_name" | "custom_id" | "created_at"
      >
    >();

  if (woErr || !wo?.id) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  // Load latest invoice for this WO (SOURCE OF TRUTH for totals/currency)
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

  // Shop (header)
  const { data: shop } = await supabase
    .from("shops")
    .select("business_name, shop_name, name, phone_number, email, street, city, province, postal_code")
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

  const customerName = pickCustomerName(customer ?? null, wo.customer_name ?? null) ?? "—";
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
  const mileage = (vehicle?.mileage ?? "").trim() || "—";
  const color = (vehicle?.color ?? "").trim() || "—";
  const engineHours = vehicle?.engine_hours != null ? String(vehicle.engine_hours) : "—";

  // Work order lines (complaint/cause/correction)
  const { data: lines } = await supabase
    .from("work_order_lines")
    .select("id, line_no, description, complaint, cause, correction, labor_time, price_estimate")
    .eq("work_order_id", workOrderId)
    .order("line_no", { ascending: true });

  const lineRows = (Array.isArray(lines) ? lines : []) as Array<
    Pick<
      WorkOrderLineRow,
      "id" | "line_no" | "description" | "complaint" | "cause" | "correction" | "labor_time" | "price_estimate"
    >
  >;

  // Parts (invoice display parts from work_order_parts + parts)
  const { data: wop } = await supabase
    .from("work_order_parts")
    .select("id, work_order_id, part_id, quantity, unit_price, total_price, created_at")
    .eq("work_order_id", workOrderId);

  const workOrderParts = (Array.isArray(wop) ? wop : []) as Array<
    Pick<WorkOrderPartRow, "part_id" | "quantity" | "unit_price" | "total_price">
  >;

  const partIds = Array.from(
    new Set(
      workOrderParts
        .map((r) => r.part_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  let partsMap = new Map<string, Pick<PartRow, "id" | "name" | "part_number" | "sku" | "unit">>();
  if (partIds.length > 0) {
    const { data: parts } = await supabase.from("parts").select("id, name, part_number, sku, unit").in("id", partIds);

    const arr = (Array.isArray(parts) ? parts : []) as Array<
      Pick<PartRow, "id" | "name" | "part_number" | "sku" | "unit">
    >;

    partsMap = new Map(arr.map((p) => [p.id, p]));
  }

  const partRows: PartDisplayRow[] = workOrderParts.map((r) => {
    const p = r.part_id ? partsMap.get(r.part_id) : undefined;

    const qty = typeof r.quantity === "number" ? r.quantity : Number(r.quantity);
    const unitPrice = safeMoney(r.unit_price);
    const totalPrice = safeMoney(r.total_price);

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
    };
  });

  // Totals + currency from invoice, fallback to safe defaults if no invoice row exists yet
  const currency: "CAD" | "USD" = normalizeInvoiceCurrency(inv?.currency);
  const subtotal = safeMoney(inv?.subtotal);
  const laborCost = safeMoney(inv?.labor_cost);
  const partsCost = safeMoney(inv?.parts_cost);
  const discountTotal = safeMoney(inv?.discount_total);
  const taxTotal = safeMoney(inv?.tax_total);
  const grandTotal = safeMoney(inv?.total);

  // ---------------- PDF ----------------
  const pdfDoc = await PDFDocument.create();

  const PAGE_W = 595.28;
  const PAGE_H = 841.89; // A4
  const marginX = 42;

  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Colors (white background + dark text + copper accents)
  const C_TEXT = rgb(0.08, 0.08, 0.08);
  const C_MUTED = rgb(0.35, 0.35, 0.35);
  const C_LIGHT = rgb(0.70, 0.70, 0.70);
  const C_COPPER = rgb(0.78, 0.48, 0.28);
  const C_HEADER_BG = rgb(0.05, 0.07, 0.10);
  const C_WHITE = rgb(1, 1, 1);

  const lineH = (size: number) => size + 6;

  let y = PAGE_H - 40;

  const drawText = (
    text: string,
    opts?: { size?: number; bold?: boolean; x?: number; color?: any },
  ) => {
    const size = opts?.size ?? 11;
    const x = opts?.x ?? marginX;
    const f = opts?.bold ? bold : font;
    const color = opts?.color ?? C_TEXT;

    page.drawText(text, { x, y, size, font: f, color });
    y -= lineH(size);
  };

  const ensureSpace = (needed: number) => !(y - needed < 60);

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

  // Header (fix top clipping by anchoring to page height)
  const headerH = 92;
  const headerY = PAGE_H - headerH; // ensures it fits

  page.drawRectangle({
    x: 0,
    y: headerY,
    width: PAGE_W,
    height: headerH,
    color: C_HEADER_BG,
  });

  // Header text positions (manual Y so we don't fight the flowing `y`)
  const headerTop = PAGE_H - 26;

  // Left: shop
  page.drawText(shopName, { x: marginX, y: headerTop, size: 16, font: bold, color: C_COPPER });
  if (shopAddress.trim().length) {
    page.drawText(shopAddress, { x: marginX, y: headerTop - 20, size: 9.5, font, color: C_LIGHT });
  }
  if (shopContact.trim().length) {
    page.drawText(shopContact, {
      x: marginX,
      y: headerTop - 34,
      size: 9.5,
      font,
      color: rgb(0.85, 0.85, 0.85),
    });
  }

  // Right: invoice meta
  const rightX = 360;
  page.drawText("INVOICE", { x: rightX, y: headerTop, size: 18, font: bold, color: C_WHITE });

  const meta1 = invoiceNumber.length ? `Invoice #: ${invoiceNumber}` : `Work Order: ${titleId}`;
  page.drawText(meta1, {
    x: rightX,
    y: headerTop - 20,
    size: 10,
    font,
    color: rgb(0.88, 0.88, 0.88),
  });
  page.drawText(`Issued: ${issuedAt}`, {
    x: rightX,
    y: headerTop - 34,
    size: 10,
    font,
    color: rgb(0.70, 0.70, 0.70),
  });

  // Start flowing content under header
  y = headerY - 22;

  // Divider
  page.drawRectangle({
    x: marginX - 10,
    y: y,
    width: PAGE_W - (marginX - 10) * 2,
    height: 2,
    color: C_COPPER,
  });
  y -= 18;

  // Customer
  drawText("Customer", { bold: true, size: 12, color: C_COPPER });
  drawText(customerName, { size: 11 });
  drawText(`Business: ${customerBusiness}`, { size: 10, color: C_MUTED });
  drawText(`Phone: ${customerPhone}`, { size: 10, color: C_MUTED });
  drawText(`Email: ${customerEmail}`, { size: 10, color: C_MUTED });
  drawText(`Address: ${customerAddress}`, { size: 10, color: C_MUTED });

  y -= 6;

  // Vehicle
  drawText("Vehicle", { bold: true, size: 12, color: C_COPPER });
  drawText(vehicleLabel, { size: 11 });
  drawText(`VIN: ${vin}`, { size: 10, color: C_MUTED });
  drawText(`Plate: ${plate}`, { size: 10, color: C_MUTED });
  drawText(`Unit #: ${unit}`, { size: 10, color: C_MUTED });
  drawText(`Mileage: ${mileage}`, { size: 10, color: C_MUTED });
  drawText(`Color: ${color}`, { size: 10, color: C_MUTED });
  drawText(`Engine Hours: ${engineHours}`, { size: 10, color: C_MUTED });

  y -= 14;

  // Line Items
  drawText("Line Items", { bold: true, size: 12, color: C_COPPER });

  if (!lineRows.length) {
    drawText("— No line items recorded yet —", { size: 10, color: C_MUTED });
  } else {
    for (const row of lineRows) {
      if (!ensureSpace(110)) break;

      const label = row.line_no != null ? `#${row.line_no}` : "•";
      const complaint = asString(row.complaint || row.description || "—");
      const cause = asString(row.cause || "");
      const correction = asString(row.correction || "");
      const labor = row.labor_time != null ? String(row.labor_time) : "";
      const est = safeMoney(row.price_estimate);

      drawText(label, { bold: true, size: 10, color: C_COPPER });

      const complaintLines = wrapText(complaint, 78);
      drawText(`Complaint: ${complaintLines[0]}`, { size: 10 });
      for (const extra of complaintLines.slice(1)) {
        drawText(`          ${extra}`, { size: 10, color: C_MUTED });
      }

      if (cause.trim()) {
        for (const c of wrapText(cause, 78)) {
          drawText(`Cause: ${c}`, { size: 10, color: C_MUTED });
        }
      }

      if (correction.trim()) {
        for (const c of wrapText(correction, 78)) {
          drawText(`Correction: ${c}`, { size: 10, color: C_MUTED });
        }
      }

      if (labor.trim()) drawText(`Labor time: ${labor} hr`, { size: 10, color: C_MUTED });
      if (est > 0) drawText(`Estimate: ${moneyLabel(est, currency)}`, { size: 10, color: C_MUTED });

      y -= 4;
      page.drawRectangle({
        x: marginX,
        y,
        width: PAGE_W - marginX * 2,
        height: 1,
        color: rgb(0.92, 0.92, 0.92),
      });
      y -= 12;
    }
  }

  // Parts
  y -= 6;
  drawText("Parts", { bold: true, size: 12, color: C_COPPER });

  if (!partRows.length) {
    drawText("— No parts on this work order —", { size: 10, color: C_MUTED });
  } else {
    // simple table header
    drawText("Qty   Part                                Unit     Total", { size: 10, bold: true });

    page.drawRectangle({
      x: marginX,
      y: y + 4,
      width: PAGE_W - marginX * 2,
      height: 1,
      color: rgb(0.90, 0.90, 0.90),
    });

    for (const p of partRows.slice(0, 25)) {
      if (!ensureSpace(34)) break;

      const qty = Number.isFinite(p.qty) ? p.qty : 0;
      const unitPrice = p.unitPrice;
      const totalPrice = p.totalPrice;

      const meta = compactCsv([p.partNumber, p.sku, p.unit]);
      const name = meta.length ? `${p.name} (${meta})` : p.name;

      const nameLines = wrapText(name, 52);

      // line 1
      page.drawText(String(qty), { x: marginX, y, size: 10, font, color: C_TEXT });
      page.drawText(nameLines[0], { x: marginX + 36, y, size: 10, font, color: C_TEXT });
      page.drawText(moneyLabel(unitPrice, currency), { x: 420, y, size: 10, font, color: C_MUTED });
      page.drawText(moneyLabel(totalPrice, currency), { x: 500, y, size: 10, font, color: C_TEXT });
      y -= lineH(10);

      // extra wrapped lines
      for (const extra of nameLines.slice(1)) {
        page.drawText(extra, { x: marginX + 36, y, size: 10, font, color: C_MUTED });
        y -= lineH(10);
      }

      y -= 2;
    }
  }

  // Totals (use invoices.* when available)
  y -= 10;
  drawText("Totals", { bold: true, size: 12, color: C_COPPER });

  if (!inv?.id) {
    drawText("— No invoice record found yet for this work order —", { size: 10, color: C_MUTED });
    drawText(
      "Create an invoice (public.invoices) to show full totals (subtotal/discount/tax/total).",
      {
        size: 10,
        color: C_MUTED,
      },
    );
  } else {
    drawText(`Subtotal: ${moneyLabel(subtotal, currency)}`, { size: 11 });
    drawText(`Labor: ${moneyLabel(laborCost, currency)}`, { size: 11, color: C_MUTED });
    drawText(`Parts: ${moneyLabel(partsCost, currency)}`, { size: 11, color: C_MUTED });
    if (discountTotal > 0) {
      drawText(`Discount: -${moneyLabel(discountTotal, currency)}`, { size: 11, color: C_MUTED });
    }
    drawText(`Tax: ${moneyLabel(taxTotal, currency)}`, { size: 11, color: C_MUTED });
    drawText(`Total: ${moneyLabel(grandTotal, currency)}`, { size: 13, bold: true });
  }

  // Footer bar
  const footerH = 34;
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W,
    height: footerH,
    color: C_HEADER_BG,
  });

  page.drawText(`${shopName} • Invoice`, {
    x: marginX,
    y: 14,
    size: 9,
    font,
    color: rgb(0.80, 0.80, 0.80),
  });
  page.drawText(`Work Order: ${titleId}`, {
    x: rightX,
    y: 14,
    size: 9,
    font,
    color: rgb(0.65, 0.65, 0.65),
  });

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