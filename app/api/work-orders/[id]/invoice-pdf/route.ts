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

function pickCustomerPhone(c?: Pick<CustomerRow, "phone" | "phone_number"> | null): string | undefined {
  const p1 = (c?.phone_number ?? "").trim();
  const p2 = (c?.phone ?? "").trim();
  const out = p1 || p2;
  return out.length ? out : undefined;
}

function pickShopName(s?: Pick<ShopRow, "business_name" | "shop_name" | "name"> | null): string | undefined {
  const a = (s?.business_name ?? "").trim();
  const b = (s?.shop_name ?? "").trim();
  const c = (s?.name ?? "").trim();
  const out = a || b || c;
  return out.length ? out : undefined;
}

function normalizeCurrencyFromCountry(country: unknown): "CAD" | "USD" {
  const c = String(country ?? "").trim().toUpperCase();
  return c === "CA" ? "CAD" : "USD";
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // Auth check (prevents “random public invoice pdf”)
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workOrderId } = await ctx.params;
  if (!workOrderId) {
    return NextResponse.json({ error: "Missing work order id" }, { status: 400 });
  }

  // Load WO
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select(
      "id, shop_id, customer_id, vehicle_id, customer_name, labor_total, parts_total, invoice_total, custom_id, created_at",
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
        | "labor_total"
        | "parts_total"
        | "invoice_total"
        | "custom_id"
        | "created_at"
      >
    >();

  if (woErr || !wo?.id) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  // Shop (header + currency)
  const { data: shop } = await supabase
    .from("shops")
    .select("business_name, shop_name, name, phone_number, email, street, city, province, postal_code, country")
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

  const currency: "CAD" | "USD" = normalizeCurrencyFromCountry(shop?.country);

  // Customer (extra fields from your schema)
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

  // Vehicle (extra fields from your schema)
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

  // Totals
  const laborTotal = safeMoney(wo.labor_total);
  const partsTotal = safeMoney(wo.parts_total);
  const invoiceTotal =
    safeMoney(wo.invoice_total) > 0 ? safeMoney(wo.invoice_total) : laborTotal + partsTotal;

  // ---------------- PDF ----------------
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 42;
  let y = 800;

  const draw = (
    text: string,
    opts?: { size?: number; bold?: boolean; x?: number; color?: [number, number, number] },
  ) => {
    const size = opts?.size ?? 11;
    const x = opts?.x ?? marginX;
    const f = opts?.bold ? bold : font;
    const c = opts?.color ?? [1, 1, 1];
    page.drawText(text, {
      x,
      y,
      size,
      font: f,
      color: rgb(c[0], c[1], c[2]),
    });
    y -= size + 6;
  };

  const titleId = wo.custom_id ? asString(wo.custom_id) : `WO-${wo.id.slice(0, 8)}`;
  const generatedAt =
    wo.created_at ? new Date(wo.created_at).toLocaleString() : new Date().toLocaleString();

  // Header bar
  page.drawRectangle({
    x: 0,
    y: 760,
    width: 595.28,
    height: 90,
    color: rgb(0.05, 0.07, 0.10),
  });

  // Left: shop
  y = 832;
  draw(shopName, { size: 16, bold: true, color: [0.78, 0.48, 0.28] });
  if (shopAddress.trim().length) draw(shopAddress, { size: 9.5, color: [0.85, 0.85, 0.85] });
  if (shopContact.trim().length) draw(shopContact, { size: 9.5, color: [0.65, 0.65, 0.65] });

  // Right: invoice meta
  const rightX = 360;
  const topY = 832;
  y = topY;
  draw("INVOICE", { size: 18, bold: true, x: rightX, color: [1, 1, 1] });
  draw(`Work Order: ${titleId}`, { size: 10, x: rightX, color: [0.85, 0.85, 0.85] });
  draw(`Generated: ${generatedAt}`, { size: 10, x: rightX, color: [0.65, 0.65, 0.65] });

  // Body divider
  y = 740;
  page.drawRectangle({
    x: marginX - 10,
    y: y - 10,
    width: 595.28 - (marginX - 10) * 2,
    height: 2,
    color: rgb(0.78, 0.48, 0.28),
  });
  y -= 24;

  // Customer
  draw("Customer", { bold: true, size: 12, color: [0.78, 0.48, 0.28] });
  draw(customerName, { size: 11, color: [1, 1, 1] });
  draw(`Business: ${customerBusiness}`, { size: 10, color: [0.85, 0.85, 0.85] });
  draw(`Phone: ${customerPhone}`, { size: 10, color: [0.85, 0.85, 0.85] });
  draw(`Email: ${customerEmail}`, { size: 10, color: [0.85, 0.85, 0.85] });
  draw(`Address: ${customerAddress}`, { size: 10, color: [0.85, 0.85, 0.85] });

  y -= 6;

  // Vehicle
  draw("Vehicle", { bold: true, size: 12, color: [0.78, 0.48, 0.28] });
  draw(vehicleLabel, { size: 11, color: [1, 1, 1] });
  draw(`VIN: ${vin}`, { size: 10, color: [0.85, 0.85, 0.85] });
  draw(`Plate: ${plate}`, { size: 10, color: [0.85, 0.85, 0.85] });
  draw(`Unit #: ${unit}`, { size: 10, color: [0.85, 0.85, 0.85] });
  draw(`Mileage: ${mileage}`, { size: 10, color: [0.85, 0.85, 0.85] });
  draw(`Color: ${color}`, { size: 10, color: [0.85, 0.85, 0.85] });
  draw(`Engine Hours: ${engineHours}`, { size: 10, color: [0.85, 0.85, 0.85] });

  y -= 14;

  // Line Items
  draw("Line Items", { bold: true, size: 12, color: [0.78, 0.48, 0.28] });

  const col1X = marginX;
  const col2X = marginX + 18;
  const ensureSpace = (needed: number) => !(y - needed < 60);

  if (!lineRows.length) {
    draw("— No line items recorded yet —", { size: 10, color: [0.85, 0.85, 0.85] });
  } else {
    for (const row of lineRows) {
      if (!ensureSpace(110)) break;

      const label = row.line_no != null ? `#${row.line_no}` : "•";

      // ✅ prefer complaint, fallback to description
      const complaint = asString(row.complaint || row.description || "—");
      const cause = asString(row.cause || "");
      const correction = asString(row.correction || "");
      const labor = row.labor_time != null ? String(row.labor_time) : "";
      const price = safeMoney(row.price_estimate);

      draw(label, { bold: true, size: 10, x: col1X, color: [0.78, 0.48, 0.28] });

      const complaintLines = wrapText(complaint, 78);
      draw(`Complaint: ${complaintLines[0]}`, { size: 10, x: col2X, color: [1, 1, 1] });
      for (const extra of complaintLines.slice(1)) {
        draw(`          ${extra}`, { size: 10, x: col2X, color: [0.9, 0.9, 0.9] });
      }

      if (cause.trim()) {
        for (const c of wrapText(cause, 78)) {
          draw(`Cause: ${c}`, { size: 10, x: col2X, color: [0.85, 0.85, 0.85] });
        }
      }

      if (correction.trim()) {
        for (const c of wrapText(correction, 78)) {
          draw(`Correction: ${c}`, { size: 10, x: col2X, color: [0.85, 0.85, 0.85] });
        }
      }

      if (labor) {
        draw(`Labor time: ${labor} hr`, { size: 10, x: col2X, color: [0.75, 0.75, 0.75] });
      }
      if (price > 0) {
        draw(`Estimate: ${moneyLabel(price, currency)}`, {
          size: 10,
          x: col2X,
          color: [0.75, 0.75, 0.75],
        });
      }

      y -= 4;
      page.drawRectangle({
        x: marginX,
        y,
        width: 595.28 - marginX * 2,
        height: 1,
        color: rgb(0.14, 0.18, 0.24),
      });
      y -= 12;
    }
  }

  // Totals
  y -= 6;
  draw("Totals", { bold: true, size: 12, color: [0.78, 0.48, 0.28] });
  draw(`Labor: ${moneyLabel(laborTotal, currency)}`, { size: 11, color: [1, 1, 1] });
  draw(`Parts: ${moneyLabel(partsTotal, currency)}`, { size: 11, color: [1, 1, 1] });
  draw(`Invoice Total: ${moneyLabel(invoiceTotal, currency)}`, {
    size: 12,
    bold: true,
    color: [1, 1, 1],
  });

  // Footer bar
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 595.28,
    height: 34,
    color: rgb(0.05, 0.07, 0.10),
  });
  y = 20;
  draw(`${shopName} • Invoice`, { size: 9, color: [0.7, 0.7, 0.7] });
  draw("For questions, contact your shop directly.", { size: 9, color: [0.55, 0.55, 0.55] });

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