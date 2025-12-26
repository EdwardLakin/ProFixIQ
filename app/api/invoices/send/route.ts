// app/api/invoices/send/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? "";
const SENDGRID_TEMPLATE_ID =
  process.env.SENDGRID_INVOICE_TEMPLATE_ID ??
  "d-b4fc5385e0964ea880f930b1ea59a37c";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com";

if (!SENDGRID_API_KEY) {
  console.warn("[invoices/send] SENDGRID_API_KEY is not set");
}
if (!SENDGRID_TEMPLATE_ID) {
  console.warn("[invoices/send] SENDGRID_INVOICE_TEMPLATE_ID is not set");
}

type RequestBody = {
  workOrderId: string;
  customerEmail: string;
  invoiceTotal?: number;
  customerName?: string;
  shopName?: string;
  // Optional extras to feed into SendGrid template
  lines?: unknown;
  vehicleInfo?: unknown;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;
    const {
      workOrderId,
      customerEmail,
      invoiceTotal,
      customerName,
      shopName,
      lines,
      vehicleInfo,
    } = body;

    if (!customerEmail || !workOrderId) {
      return NextResponse.json(
        { error: "Missing email or work order ID" },
        { status: 400 },
      );
    }

    if (!SENDGRID_API_KEY || !SENDGRID_TEMPLATE_ID) {
      return NextResponse.json(
        { error: "Email service is not configured" },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 1) Fetch work order (need customer_id to find portal user)
    // ------------------------------------------------------------------
    const { data: wo, error: woErr } = await supabaseAdmin
      .from("work_orders")
      .select("id, shop_id, customer_id")
      .eq("id", workOrderId)
      .maybeSingle<Pick<WorkOrderRow, "id" | "shop_id" | "customer_id">>();

    if (woErr || !wo) {
      return NextResponse.json(
        { error: "Invalid work order" },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 2) Resolve portal user via customers.user_id (auth.users.id)
    // ------------------------------------------------------------------
    let portalUserId: string | null = null;
    let portalCustomerId: string | null = null;

    if (wo.customer_id) {
      const { data: customer, error: customerErr } = await supabaseAdmin
        .from("customers")
        .select("id, user_id")
        .eq("id", wo.customer_id)
        .maybeSingle<Pick<CustomerRow, "id" | "user_id">>();

      if (!customerErr && customer) {
        portalCustomerId = customer.id;
        portalUserId = customer.user_id ?? null;
      }
    }

    const portalInvoiceUrl = `${SITE_URL}/portal/invoices/${workOrderId}`;

    // ------------------------------------------------------------------
    // 3) Send the invoice email via SendGrid (dynamic template)
    // ------------------------------------------------------------------
    const emailPayload = {
      personalizations: [
        {
          to: [{ email: customerEmail }],
          dynamic_template_data: {
            workOrderId,
            customerName,
            shopName,
            invoiceTotal,
            vehicleInfo,
            lines,
            portalUrl: portalInvoiceUrl,
          },
        },
      ],
      from: { email: "no-reply@profixiq.com", name: "ProFixIQ" },
      template_id: SENDGRID_TEMPLATE_ID,
    };

    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    if (!sgRes.ok) {
      const t = await sgRes.text();
      throw new Error(`SendGrid error: ${t}`);
    }

    // ------------------------------------------------------------------
    // 4) Update invoice metadata on the work order
    // ------------------------------------------------------------------
    await supabaseAdmin
      .from("work_orders")
      .update({
        invoice_sent_at: new Date().toISOString(),
        invoice_last_sent_to: customerEmail,
        invoice_total: invoiceTotal ?? null,
        invoice_url: portalInvoiceUrl,
      })
      .eq("id", workOrderId);

    // ------------------------------------------------------------------
    // 5) Create portal notification (if we have a portal user)
    // ------------------------------------------------------------------
    if (portalUserId) {
      await supabaseAdmin.from("portal_notifications").insert({
        user_id: portalUserId,
        customer_id: portalCustomerId,
        work_order_id: workOrderId,
        kind: "invoice_ready",
        title: "Invoice ready",
        body: `Your invoice for Work Order ${workOrderId} at ${
          shopName ?? "the shop"
        } is ready to view in your portal.`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error sending invoice";
    console.error("[invoices/send] Invoice Send Failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}