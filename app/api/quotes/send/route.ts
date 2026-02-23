// /app/api/quotes/send/route.ts (FULL FILE)
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type LineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type AllocRow = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];

type QuoteLine = { description: string; amount: number };

type VehicleInfo = {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
};

type RequestBody = {
  workOrderId: string;
  customerEmail?: string;
  quoteTotal?: number;
  customerName?: string;
  shopName?: string;
  lines?: QuoteLine[];
  vehicleInfo?: VehicleInfo;
  pdfUrl?: string | null;
};

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

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function buildCustomerName(customer: {
  first_name?: string | null;
  last_name?: string | null;
  business_name?: string | null;
} | null): string {
  if (!customer) return "";
  if (customer.business_name) return customer.business_name;
  const first = customer.first_name ?? "";
  const last = customer.last_name ?? "";
  return `${first} ${last}`.trim();
}

export async function POST(req: Request) {
  const trace = `quotes-send:${Date.now()}:${Math.random().toString(16).slice(2)}`;

  try {
    const body = (await req.json().catch(() => null)) as RequestBody | null;

    const workOrderId = safeStr(body?.workOrderId).trim();

    if (!workOrderId) {
      return NextResponse.json(
        { ok: false, trace, error: "Missing workOrderId" },
        { status: 400 },
      );
    }

    if (!isUuid(workOrderId)) {
      return NextResponse.json(
        {
          ok: false,
          trace,
          error:
            "Invalid workOrderId (expected UUID). You may be sending custom_id instead.",
          detail: { received: workOrderId },
        },
        { status: 400 },
      );
    }

    if (!SENDGRID_API_KEY || !SENDGRID_QUOTE_TEMPLATE_ID) {
      return NextResponse.json(
        { ok: false, trace, error: "Email service is not configured" },
        { status: 500 },
      );
    }

    // 1) Load WO
    const { data: wo, error: woErr } = await supabaseAdmin
      .from("work_orders")
      .select("id, customer_id, shop_id, vehicle_id, quote_url")
      .eq("id", workOrderId)
      .maybeSingle<
        Pick<
          WorkOrderRow,
          "id" | "customer_id" | "shop_id" | "vehicle_id" | "quote_url"
        >
      >();

    if (woErr) {
      return NextResponse.json(
        { ok: false, trace, error: "Failed to load work order", detail: woErr.message },
        { status: 400 },
      );
    }
    if (!wo) {
      return NextResponse.json(
        { ok: false, trace, error: "Invalid work order" },
        { status: 404 },
      );
    }

    // 2) Load customer (email, portal user mapping)
    let portalUserId: string | null = null;
    let portalCustomerId: string | null = null;
    let customerEmail =
      safeStr(body?.customerEmail).trim() || "";

    let customerName =
      safeStr(body?.customerName).trim() || "";

    if (wo.customer_id) {
      const { data: customer, error: customerErr } = await supabaseAdmin
        .from("customers")
        .select("id, user_id, email, first_name, last_name")
        .eq("id", wo.customer_id)
        .maybeSingle<Pick<CustomerRow, "id" | "user_id" | "email" | "first_name" | "last_name">>();

      if (!customerErr && customer) {
        portalCustomerId = customer.id;
        portalUserId = customer.user_id ?? null;

        if (!customerEmail) customerEmail = safeStr(customer.email).trim();
        if (!customerName) customerName = buildCustomerName(customer) ?? "";
      }
    }

    if (!customerEmail) {
      return NextResponse.json(
        {
          ok: false,
          trace,
          error:
            "Missing customer email (no customerEmail provided and customers.email is empty).",
        },
        { status: 400 },
      );
    }

    // 3) Load shop name + labor rate (optional; used to compute totals)
    let shopName = safeStr(body?.shopName).trim() || "";
    let laborRate = 0;

    if (wo.shop_id) {
      const { data: shop, error: shopErr } = await supabaseAdmin
        .from("shops")
        .select("name, labor_rate")
        .eq("id", wo.shop_id)
        .maybeSingle<Pick<ShopRow, "name" | "labor_rate">>();

      if (!shopErr && shop) {
        if (!shopName) shopName = safeStr(shop.name).trim();
        laborRate = asNumber(shop.labor_rate) ?? 0;
      }
    }

    // 4) Vehicle info (optional)
    let vehicleInfo: VehicleInfo | undefined = body?.vehicleInfo;
    if (!vehicleInfo && wo.vehicle_id) {
      const { data: v } = await supabaseAdmin
        .from("vehicles")
        .select("year, make, model")
        .eq("id", wo.vehicle_id)
        .maybeSingle<Pick<VehicleRow, "year" | "make" | "model">>();

      if (v) {
        vehicleInfo = {
          year: v.year ?? null,
          make: v.make ?? null,
          model: v.model ?? null,
        };
      }
    }

    // 5) Compute lines + totals if not provided
    let lines: QuoteLine[] | undefined = body?.lines;
    let quoteTotal: number | undefined = body?.quoteTotal;

    if (!lines || lines.length === 0 || typeof quoteTotal !== "number") {
      const [linesRes, allocsRes] = await Promise.all([
        supabaseAdmin
          .from("work_order_lines")
          .select("id, description, complaint, labor_time")
          .eq("work_order_id", workOrderId)
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("work_order_part_allocations")
          .select("work_order_line_id, qty, unit_cost")
          .eq("work_order_id", workOrderId),
      ]);

      const lineRows = (linesRes.data ?? []) as Array<
        Pick<LineRow, "id" | "description" | "complaint" | "labor_time">
      >;

      const allocRows = (allocsRes.data ?? []) as Array<
        Pick<AllocRow, "work_order_line_id" | "qty" | "unit_cost">
      >;

      const partsByLine = new Map<string, number>();
      for (const a of allocRows) {
        const lnId = a.work_order_line_id;
        if (!lnId) continue;

        const qty = typeof a.qty === "number" ? a.qty : Number(a.qty);
        const unit = typeof a.unit_cost === "number" ? a.unit_cost : Number(a.unit_cost);

        const q = Number.isFinite(qty) ? qty : 0;
        const u = Number.isFinite(unit) ? unit : 0;

        const prev = partsByLine.get(lnId) ?? 0;
        partsByLine.set(lnId, prev + q * u);
      }

      const computed: QuoteLine[] = [];
      let computedTotal = 0;

      for (const l of lineRows) {
        const hrs = typeof l.labor_time === "number" ? l.labor_time : 0;
        const laborAmt = hrs * laborRate;
        const partsAmt = partsByLine.get(l.id) ?? 0;

        const amount = laborAmt + partsAmt;
        computedTotal += amount;

        const desc =
          safeStr(l.description).trim() ||
          safeStr(l.complaint).trim() ||
          "Job";

        computed.push({ description: desc, amount });
      }

      if (!lines || lines.length === 0) lines = computed;
      if (typeof quoteTotal !== "number") quoteTotal = computedTotal;
    }

    const pdfUrl = body?.pdfUrl ?? null;

    // 6) Build portal quote URL
    const appUrlEnv =
      process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    const normalizedAppUrl = appUrlEnv ? appUrlEnv.replace(/\/$/, "") : "";
    const portalQuoteUrl = normalizedAppUrl
      ? `${normalizedAppUrl}/portal/quotes/${workOrderId}`
      : null;

    // 7) Send via SendGrid
    const emailPayload = {
      personalizations: [
        {
          to: [{ email: customerEmail }],
          dynamic_template_data: {
            workOrderId,
            customerName: customerName || undefined,
            shopName: shopName || undefined,
            quoteTotal,
            vehicleInfo,
            lines,
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
        { ok: false, trace, error: "SendGrid error", detail: t },
        { status: 502 },
      );
    }

    // 8) Update quote_url on work order
    const newQuoteUrl = portalQuoteUrl ?? pdfUrl ?? wo.quote_url ?? null;

    if (newQuoteUrl !== wo.quote_url) {
      const { error: updErr } = await supabaseAdmin
        .from("work_orders")
        .update({ quote_url: newQuoteUrl })
        .eq("id", workOrderId);

      if (updErr) {
        return NextResponse.json(
          {
            ok: true,
            trace,
            warning: "Quote email sent, but failed to update work order quote_url",
            detail: updErr.message,
          },
          { status: 200 },
        );
      }
    }

    // 9) Create portal notification (if portal user exists)
    if (portalUserId) {
      const { error: notifErr } = await supabaseAdmin
        .from("portal_notifications")
        .insert({
          user_id: portalUserId,
          customer_id: portalCustomerId,
          work_order_id: workOrderId,
          kind: "quote_ready",
          title: "Quote ready",
          body: `Your quote for Work Order ${workOrderId} at ${
            shopName || "the shop"
          } is ready to review in your portal.`,
        });

      if (notifErr) {
        return NextResponse.json(
          {
            ok: true,
            trace,
            warning: "Quote email sent, but failed to create portal notification",
            detail: notifErr.message,
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json({ ok: true, trace });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error sending quote";
    console.error("[quotes/send] Quote Send Failed:", trace, message);
    return NextResponse.json(
      { ok: false, trace, error: "Quote send failed", detail: message },
      { status: 500 },
    );
  }
}