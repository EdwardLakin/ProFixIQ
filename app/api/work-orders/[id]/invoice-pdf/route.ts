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

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function safeMoney(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function moneyLabel(n: number, currency: "CAD" | "USD"): string {
  const val = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-CA", {
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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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

  // Customer
  let customer: Pick<CustomerRow, "first_name" | "last_name" | "phone" | "email"> | null =
    null;

  if (wo.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("first_name,last_name,phone,email")
      .eq("id", wo.customer_id)
      .maybeSingle<Pick<CustomerRow, "first_name" | "last_name" | "phone" | "email">>();
    customer = c ?? null;
  }

  // Vehicle
  let vehicle: Pick<VehicleRow, "year" | "make" | "model" | "vin"> | null = null;

  if (wo.vehicle_id) {
    const { data: v } = await supabase
      .from("vehicles")
      .select("year,make,model,vin")
      .eq("id", wo.vehicle_id)
      .maybeSingle<Pick<VehicleRow, "year" | "make" | "model" | "vin">>();
    vehicle = v ?? null;
  }

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

  // Currency guess (simple + safe)
  const currency: "CAD" | "USD" = "CAD";

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

  // Header bar
  page.drawRectangle({
    x: 0,
    y: 760,
    width: 595.28,
    height: 90,
    color: rgb(0.05, 0.07, 0.10),
  });

  y = 828;
  draw("ProFixIQ", { size: 20, bold: true, color: [0.78, 0.48, 0.28] });
  draw("Work Order Invoice", { size: 12, bold: true, color: [1, 1, 1] });

  const titleId = wo.custom_id ? asString(wo.custom_id) : `WO-${wo.id.slice(0, 8)}`;
  draw(`Work Order: ${titleId}`, { size: 10, color: [0.85, 0.85, 0.85] });
  draw(
    `Generated: ${
      wo.created_at ? new Date(wo.created_at).toLocaleString() : new Date().toLocaleString()
    }`,
    { size: 10, color: [0.65, 0.65, 0.65] },
  );

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

  const customerName =
    [customer?.first_name ?? "", customer?.last_name ?? ""].filter(Boolean).join(" ") ||
    wo.customer_name ||
    "—";

  const vehicleLabel = [
    vehicle?.year ? String(vehicle.year) : "",
    vehicle?.make ?? "",
    vehicle?.model ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  draw("Customer", { bold: true, size: 12, color: [0.78, 0.48, 0.28] });
  draw(customerName, { size: 11, color: [1, 1, 1] });
  draw(customer?.phone ? `Phone: ${customer.phone}` : "Phone: —", {
    size: 10,
    color: [0.85, 0.85, 0.85],
  });
  draw(customer?.email ? `Email: ${customer.email}` : "Email: —", {
    size: 10,
    color: [0.85, 0.85, 0.85],
  });

  y -= 6;

  draw("Vehicle", { bold: true, size: 12, color: [0.78, 0.48, 0.28] });
  draw(vehicleLabel || "—", { size: 11, color: [1, 1, 1] });
  draw(vehicle?.vin ? `VIN: ${vehicle.vin}` : "VIN: —", {
    size: 10,
    color: [0.85, 0.85, 0.85],
  });

  y -= 14;

  draw("Line Items", { bold: true, size: 12, color: [0.78, 0.48, 0.28] });

  const col1X = marginX;
  const col2X = marginX + 18;

  const ensureSpace = (needed: number) => !(y - needed < 60);

  if (!lineRows.length) {
    draw("— No line items recorded yet —", { size: 10, color: [0.85, 0.85, 0.85] });
  } else {
    for (const row of lineRows) {
      if (!ensureSpace(90)) break;

      const label = row.line_no != null ? `#${row.line_no}` : "•";
      const complaint = asString(row.description || row.complaint || "—");
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

      if (labor)
        draw(`Labor time: ${labor} hr`, { size: 10, x: col2X, color: [0.75, 0.75, 0.75] });
      if (price > 0)
        draw(`Estimate: ${moneyLabel(price, currency)}`, {
          size: 10,
          x: col2X,
          color: [0.75, 0.75, 0.75],
        });

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

  y -= 6;
  draw("Totals", { bold: true, size: 12, color: [0.78, 0.48, 0.28] });
  draw(`Labor: ${moneyLabel(laborTotal, currency)}`, { size: 11, color: [1, 1, 1] });
  draw(`Parts: ${moneyLabel(partsTotal, currency)}`, { size: 11, color: [1, 1, 1] });
  draw(`Invoice Total: ${moneyLabel(invoiceTotal, currency)}`, {
    size: 12,
    bold: true,
    color: [1, 1, 1],
  });

  page.drawRectangle({
    x: 0,
    y: 0,
    width: 595.28,
    height: 34,
    color: rgb(0.05, 0.07, 0.10),
  });
  y = 20;
  draw("ProFixIQ • Mobile Repair & Diagnostics", { size: 9, color: [0.7, 0.7, 0.7] });
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