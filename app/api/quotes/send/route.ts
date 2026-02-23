/// /app/api/quotes/send/route.ts (FULL FILE REPLACEMENT)
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];

// IMPORTANT: service-role only on server
const supabaseAdmin = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? "";
const SENDGRID_QUOTE_TEMPLATE_ID =
  process.env.SENDGRID_QUOTE_TEMPLATE_ID ??
  "d-0e31b4d9b1dc4d59970eb25016b5fee6";

if (!SENDGRID_API_KEY) console.warn("[quotes/send] SENDGRID_API_KEY is not set");
if (!SENDGRID_QUOTE_TEMPLATE_ID)
  console.warn("[quotes/send] SENDGRID_QUOTE_TEMPLATE_ID is not set");

type QuoteLine = {
  description: string;
  amount: number;
};

type VehicleInfo = {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
};

type RequestBody = {
  workOrderId: string;
  customerEmail: string;
  quoteTotal?: number;
  customerName?: string;
  shopName?: string;
  lines?: QuoteLine[];
  vehicleInfo?: VehicleInfo;
  /** Optional public URL to the quote PDF */
  pdfUrl?: string | null;
};

function isUuid(v: string): boolean {
  // accepts v4/v5/etc
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as RequestBody | null;

    const workOrderId = safeStr(body?.workOrderId);
    const customerEmail = safeStr(body?.customerEmail);

    const quoteTotal = body?.quoteTotal;
    const customerName = body?.customerName;
    const shopName = body?.shopName;
    const lines = body?.lines;
    const vehicleInfo = body?.vehicleInfo;
    const pdfUrl = body?.pdfUrl ?? null;

    if (!workOrderId || !customerEmail) {
      return NextResponse.json(
        { error: "Missing workOrderId or customerEmail" },
        { status: 400 },
      );
    }

    // ✅ This catches the classic bug: passing custom_id (like TO000006) into uuid columns
    if (!isUuid(workOrderId)) {
      return NextResponse.json(
        {
          error:
            "Invalid workOrderId (expected UUID). You may be sending custom_id instead.",
          detail: { received: workOrderId },
        },
        { status: 400 },
      );
    }

    if (!SENDGRID_API_KEY || !SENDGRID_QUOTE_TEMPLATE_ID) {
      return NextResponse.json(
        { error: "Email service is not configured" },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 1) Fetch work order (to resolve portal user + store quote_url)
    // ------------------------------------------------------------------
    const { data: wo, error: woErr } = await supabaseAdmin
      .from("work_orders")
      .select("id, customer_id, shop_id, quote_url")
      .eq("id", workOrderId)
      .maybeSingle<
        Pick<WorkOrderRow, "id" | "customer_id" | "shop_id" | "quote_url">
      >();

    if (woErr) {
      return NextResponse.json(
        { error: "Failed to load work order", detail: woErr.message },
        { status: 400 },
      );
    }

    if (!wo) {
      return NextResponse.json({ error: "Invalid work order" }, { status: 404 });
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

    // ------------------------------------------------------------------
    // 3) Build portal quote URL
    // ------------------------------------------------------------------
    const appUrlEnv =
      process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    const normalizedAppUrl =
      appUrlEnv.length > 0 ? appUrlEnv.replace(/\/$/, "") : null;

    const portalQuoteUrl = normalizedAppUrl
      ? `${normalizedAppUrl}/portal/quotes/${workOrderId}`
      : null;

    // ------------------------------------------------------------------
    // 4) Send the quote email via SendGrid (dynamic template)
    // ------------------------------------------------------------------
    const emailPayload = {
      personalizations: [
        {
          to: [{ email: customerEmail }],
          dynamic_template_data: {
            workOrderId,
            customerName,
            shopName,
            quoteTotal,
            vehicleInfo,
            lines,
            // both options available to the template
            pdfUrl,
            quoteUrl: portalQuoteUrl,
          },
        },
      ],
      from: { email: "no-reply@profixiq.com", name: "ProFixIQ" },
      template_id: SENDGRID_QUOTE_TEMPLATE_ID,
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
      return NextResponse.json(
        { error: "SendGrid error", detail: t },
        { status: 502 },
      );
    }

    // ------------------------------------------------------------------
    // 5) Update quote_url on the work order
    // ------------------------------------------------------------------
    const newQuoteUrl = portalQuoteUrl ?? pdfUrl ?? wo.quote_url ?? null;

    if (newQuoteUrl !== wo.quote_url) {
      const { error: updErr } = await supabaseAdmin
        .from("work_orders")
        .update({ quote_url: newQuoteUrl })
        .eq("id", workOrderId);

      if (updErr) {
        // Don't fail the whole request (email already sent) but DO return detail
        return NextResponse.json(
          {
            ok: true,
            warning: "Quote email sent, but failed to update work order quote_url",
            detail: updErr.message,
          },
          { status: 200 },
        );
      }
    }

    // ------------------------------------------------------------------
    // 6) Create portal notification (if we have a portal user)
    // ------------------------------------------------------------------
    if (portalUserId) {
      const { error: notifErr } = await supabaseAdmin
        .from("portal_notifications")
        .insert({
          user_id: portalUserId,
          customer_id: portalCustomerId,
          work_order_id: workOrderId, // ✅ UUID guaranteed now
          kind: "quote_ready",
          title: "Quote ready",
          body: `Your quote for Work Order ${workOrderId} at ${
            shopName ?? "the shop"
          } is ready to review in your portal.`,
        });

      if (notifErr) {
        return NextResponse.json(
          {
            ok: true,
            warning:
              "Quote email sent, but failed to create portal notification",
            detail: notifErr.message,
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error sending quote";
    console.error("[quotes/send] Quote Send Failed:", message);
    return NextResponse.json(
      { error: "Quote send failed", detail: message },
      { status: 500 },
    );
  }
}