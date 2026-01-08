// app/api/invoices/send/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];

const supabaseAdmin = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? "";
const SENDGRID_TEMPLATE_ID =
  process.env.SENDGRID_INVOICE_TEMPLATE_ID ??
  "d-b4fc5385e0964ea880f930b1ea59a37c";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com";

const SENDGRID_FROM_EMAIL =
  process.env.SENDGRID_FROM_EMAIL || "support@profixiq.com";
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "ProFixIQ";

if (!SENDGRID_API_KEY) {
  console.warn("[invoices/send] SENDGRID_API_KEY is not set");
}
if (!SENDGRID_TEMPLATE_ID) {
  console.warn("[invoices/send] SENDGRID_INVOICE_TEMPLATE_ID is not set");
}

/* ------------------------------------------------------------------ */
/* Types + runtime guards (no `unknown` leakage) */
/* ------------------------------------------------------------------ */

type VehicleInfo = { year?: string; make?: string; model?: string; vin?: string };

type InvoiceLinePayload = {
  complaint?: string | null;
  cause?: string | null;
  correction?: string | null;
  labor_time?: string | number | null;
  lineId?: string | null;
};

type RequestBody = {
  workOrderId: string;
  customerEmail: string;
  invoiceTotal?: number;
  customerName?: string;
  shopName?: string;
  lines?: InvoiceLinePayload[];
  vehicleInfo?: VehicleInfo;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function asString(x: unknown): string | undefined {
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(x);
  return undefined;
}

function asNumber(x: unknown): number | undefined {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function sanitizeVehicleInfo(x: unknown): VehicleInfo | undefined {
  if (!isRecord(x)) return undefined;

  const year = asString(x.year)?.trim();
  const make = asString(x.make)?.trim();
  const model = asString(x.model)?.trim();
  const vin = asString(x.vin)?.trim();

  const out: VehicleInfo = {};
  if (year) out.year = year;
  if (make) out.make = make;
  if (model) out.model = model;
  if (vin) out.vin = vin;

  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeLines(x: unknown): InvoiceLinePayload[] | undefined {
  if (!Array.isArray(x)) return undefined;

  const out: InvoiceLinePayload[] = [];

  for (const item of x) {
    if (!isRecord(item)) continue;

    const complaint = asString(item.complaint)?.trim();
    const cause = asString(item.cause)?.trim();
    const correction = asString(item.correction)?.trim();

    const labor_time_raw = item.labor_time;
    const labor_time_num = asNumber(labor_time_raw);
    const labor_time_str =
      typeof labor_time_raw === "string" ? labor_time_raw.trim() : undefined;

    const lineId =
      (typeof item.lineId === "string" ? item.lineId.trim() : undefined) ??
      (typeof item.id === "string" ? item.id.trim() : undefined) ??
      (typeof item.line_id === "string" ? item.line_id.trim() : undefined) ??
      (typeof item.work_order_line_id === "string"
        ? item.work_order_line_id.trim()
        : undefined);

    out.push({
      complaint: complaint?.length ? complaint : null,
      cause: cause?.length ? cause : null,
      correction: correction?.length ? correction : null,
      labor_time:
        labor_time_num !== undefined
          ? labor_time_num
          : labor_time_str?.length
            ? labor_time_str
            : null,
      lineId: lineId?.length ? lineId : null,
    });
  }

  return out.length > 0 ? out : undefined;
}

type ParsedBody =
  | { ok: true; body: RequestBody }
  | { ok: false; error: string; status: number };

function parseRequestBody(raw: unknown): ParsedBody {
  if (!isRecord(raw)) {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }

  const workOrderId = asString(raw.workOrderId)?.trim() ?? "";
  const customerEmail = asString(raw.customerEmail)?.trim() ?? "";

  if (!workOrderId || !customerEmail) {
    return { ok: false, error: "Missing email or work order ID", status: 400 };
  }

  const invoiceTotal = asNumber(raw.invoiceTotal);
  const customerName = asString(raw.customerName)?.trim();
  const shopName = asString(raw.shopName)?.trim();
  const vehicleInfo = sanitizeVehicleInfo(raw.vehicleInfo);
  const lines = sanitizeLines(raw.lines);

  const body: RequestBody = {
    workOrderId,
    customerEmail,
    invoiceTotal,
    customerName,
    shopName,
    vehicleInfo,
    lines,
  };

  return { ok: true, body };
}

/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  try {
    const raw = (await req.json().catch(() => null)) as unknown;

    const parsed = parseRequestBody(raw);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const {
      workOrderId,
      customerEmail,
      invoiceTotal,
      customerName,
      shopName,
      lines,
      vehicleInfo,
    } = parsed.body;

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
            customerName: customerName ?? null,
            shopName: shopName ?? null,
            invoiceTotal: invoiceTotal ?? null,
            vehicleInfo: vehicleInfo ?? null,
            lines: lines ?? null,
            portalUrl: portalInvoiceUrl,
          },
        },
      ],
      from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
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

    const resBody = await sgRes.text().catch(() => "");

    if (!sgRes.ok) {
      console.error(
        "[invoices/send] SendGrid error:",
        sgRes.status,
        sgRes.statusText,
        resBody,
      );
      throw new Error(`SendGrid error: ${sgRes.status} ${sgRes.statusText}`);
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
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error sending invoice";
    console.error("[invoices/send] Invoice Send Failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}