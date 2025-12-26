// supabase/functions/send-invoice-email/index.ts
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import sendgrid from "https://esm.sh/@sendgrid/mail@7";

sendgrid.setApiKey(Deno.env.get("SENDGRID_API_KEY") ?? "");

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const siteUrl =
  (Deno.env.get("SITE_URL") || "https://profixiq.com").replace(/\/$/, "");

const supabase = createClient(supabaseUrl, serviceKey);

// ------- Types that mirror your TS in the app ---------
type InvoiceLine = {
  title: string;
  description?: string;
  quantity?: number;
  rate?: number;
  total?: number;
  partName?: string;
  jobType?: string;
};

type VehicleInfo = {
  year?: string;
  make?: string;
  model?: string;
  vin?: string;
};

type CustomerInfo = {
  name?: string;
  phone?: string;
  email?: string;
};

type RequestBody = {
  workOrderId: string;
  vehicleId?: string;
  lines: InvoiceLine[];
  summary?: string;
  vehicleInfo?: VehicleInfo;
  customerInfo?: CustomerInfo;
  invoiceTotal?: number;
  pdfUrl?: string | null;
  shopName?: string;
};

const jsonHeaders = {
  "Content-Type": "application/json",
};

function computeTotal(lines: InvoiceLine[]): number {
  return lines.reduce((sum, line) => {
    const explicit = typeof line.total === "number" ? line.total : undefined;
    if (explicit !== undefined) return sum + explicit;

    const qty = line.quantity ?? 1;
    const rate = line.rate ?? 0;
    return sum + qty * rate;
  }, 0);
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: jsonHeaders },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: jsonHeaders },
    );
  }

  const {
    workOrderId,
    lines = [],
    vehicleInfo,
    customerInfo,
    invoiceTotal,
    pdfUrl,
    shopName,
  } = body;

  const customerEmail = customerInfo?.email?.trim().toLowerCase();
  const customerName = customerInfo?.name ?? "";

  if (!workOrderId || !customerEmail) {
    return new Response(
      JSON.stringify({ error: "workOrderId and customer email are required" }),
      { status: 400, headers: jsonHeaders },
    );
  }

  const templateId = Deno.env.get("SENDGRID_INVOICE_TEMPLATE_ID");
  if (!templateId) {
    return new Response(
      JSON.stringify({ error: "SENDGRID_INVOICE_TEMPLATE_ID is not set" }),
      { status: 500, headers: jsonHeaders },
    );
  }

  const total = typeof invoiceTotal === "number"
    ? invoiceTotal
    : computeTotal(lines);

  // For now, portal button goes to the portal home
  const portalUrl = `${siteUrl}/portal`;

  try {
    // 1) Send invoice email via SendGrid dynamic template
    await sendgrid.send({
      to: customerEmail,
      from: {
        email: Deno.env.get("SENDGRID_FROM_EMAIL") ?? "support@profixiq.com",
        name: "ProFixIQ",
      },
      templateId,
      dynamicTemplateData: {
        customer_name: customerName,
        work_order_id: workOrderId,
        invoice_total: total.toFixed(2),

        vehicle_year: vehicleInfo?.year ?? "",
        vehicle_make: vehicleInfo?.make ?? "",
        vehicle_model: vehicleInfo?.model ?? "",
        vehicle_vin: vehicleInfo?.vin ?? "",

        pdf_url: pdfUrl ?? "",
        portal_url: portalUrl,
        shop_name: shopName ?? "",
        site_url: siteUrl,
      },
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
        openTracking: { enable: true },
      },
    } as sendgrid.MailDataRequired);

    // 2) Best-effort: update work_orders invoice_* fields
    try {
      await supabase
        .from("work_orders")
        .update({
          invoice_sent_at: new Date().toISOString(),
          invoice_last_sent_to: customerEmail,
          invoice_total: total,
          invoice_pdf_url: pdfUrl ?? null,
        })
        .eq("id", workOrderId);
    } catch (_e) {
      // log only on the edge logs; don't fail the email
      console.error("Failed to update work_orders invoice_* columns", _e);
    }

    // 3) Best-effort: create a portal notification if we can resolve user_id
    try {
      const { data: customerRow } = await supabase
        .from("customers")
        .select("id, user_id, shop_id")
        .eq("email", customerEmail)
        .maybeSingle();

      if (customerRow?.user_id) {
        await supabase.from("portal_notifications").insert({
          user_id: customerRow.user_id,
          customer_id: customerRow.id,
          work_order_id: workOrderId,
          shop_id: customerRow.shop_id,
          kind: "invoice_sent",
          title: "Invoice ready",
          body: `Invoice for work order #${workOrderId} is ready in your portal.`,
        });
      }
    } catch (_e) {
      console.error("Failed to insert portal_notification", _e);
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    console.error("send-invoice-email edge error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to send invoice email" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});