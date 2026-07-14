export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Database } from "@shared/types/types/supabase";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getInvoiceVersionById } from "@/features/invoices/server/invoiceVersionQueries";

type DB = Database;

function money(value: number | null | undefined, currency: "CAD" | "USD") {
  return new Intl.NumberFormat(currency === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency,
  }).format(Number(value ?? 0));
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const sessionClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const admin = createClient<DB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const version = await getInvoiceVersionById({ supabase: admin, invoiceVersionId: id });
  if (!version) return NextResponse.json({ error: "Invoice version not found" }, { status: 404 });

  const [{ data: profile }, { data: workOrder }] = await Promise.all([
    admin
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle<{ shop_id: string | null }>(),
    admin
      .from("work_orders")
      .select("customer_id")
      .eq("id", version.work_order_id)
      .eq("shop_id", version.shop_id)
      .maybeSingle<{ customer_id: string | null }>(),
  ]);

  let customerAccess = false;
  if (workOrder?.customer_id) {
    const { data: customer } = await admin
      .from("customers")
      .select("user_id")
      .eq("id", workOrder.customer_id)
      .maybeSingle<{ user_id: string | null }>();
    customerAccess = customer?.user_id === user.id;
  }
  if (profile?.shop_id !== version.shop_id && !customerAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snapshot = version.snapshot;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 748;

  const draw = (value: string, size = 10, isBold = false, x = 48) => {
    if (y < 60) {
      page = pdf.addPage([612, 792]);
      y = 748;
    }
    page.drawText(value.slice(0, 95), {
      x,
      y,
      size,
      font: isBold ? bold : regular,
      color: rgb(0.08, 0.1, 0.14),
    });
    y -= size + 7;
  };

  const shopName =
    snapshot.shop?.business_name || snapshot.shop?.shop_name || snapshot.shop?.name || "ProFixIQ";
  const customerName =
    snapshot.customer?.name ||
    [snapshot.customer?.first_name, snapshot.customer?.last_name].filter(Boolean).join(" ") ||
    snapshot.workOrder.customer_name ||
    "Customer";
  const vehicle = [snapshot.vehicle?.year, snapshot.vehicle?.make, snapshot.vehicle?.model]
    .filter((value) => value != null && String(value).trim())
    .join(" ");

  draw(shopName, 18, true);
  draw(`Invoice version ${version.version_number}`, 13, true);
  draw(`Status: ${version.lifecycle_status.replaceAll("_", " ")}`);
  draw(`Issued: ${version.issued_at ? new Date(version.issued_at).toLocaleString() : "—"}`);
  y -= 8;
  draw(`Customer: ${customerName}`, 11, true);
  draw(`Vehicle: ${vehicle || "—"}`);
  draw(`VIN: ${text(snapshot.vehicle?.vin)}`);
  y -= 10;
  draw("Work performed", 12, true);
  for (const line of snapshot.lines) {
    draw(`${line.line_no ?? ""} ${line.description || line.complaint || "Service line"}`, 10, true);
    if (line.cause) draw(`Cause: ${line.cause}`, 9, false, 60);
    if (line.correction) draw(`Correction: ${line.correction}`, 9, false, 60);
  }
  y -= 8;
  draw("Parts", 12, true);
  for (const part of snapshot.parts) {
    draw(`${part.name} × ${part.qty} — ${money(part.totalPrice, version.currency)}`);
  }
  y -= 10;
  draw(`Labor: ${money(snapshot.laborCost, version.currency)}`, 11);
  draw(`Parts: ${money(snapshot.partsCost, version.currency)}`, 11);
  draw(`Shop supplies: ${money(snapshot.shopSuppliesTotal, version.currency)}`, 11);
  draw(`Discount: -${money(snapshot.discountTotal, version.currency)}`, 11);
  draw(`Tax: ${money(snapshot.taxTotal, version.currency)}`, 11);
  draw(`Total: ${money(version.total, version.currency)}`, 14, true);
  draw(`Paid: ${money(Number(version.paid_total) - Number(version.refunded_total), version.currency)}`, 11);
  draw(`Balance: ${money(version.outstanding_total, version.currency)}`, 12, true);

  const bytes = await pdf.save();
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="invoice-version-${version.version_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
