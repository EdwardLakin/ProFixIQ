// app/api/invoices/send/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];

const supabaseAdmin = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? "";
const SENDGRID_TEMPLATE_ID =
  process.env.SENDGRID_INVOICE_TEMPLATE_ID ?? "d-b4fc5385e0964ea880f930b1ea59a37c";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com";

const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "support@profixiq.com";
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "ProFixIQ";

if (!SENDGRID_API_KEY) console.warn("[invoices/send] SENDGRID_API_KEY is not set");
if (!SENDGRID_TEMPLATE_ID) console.warn("[invoices/send] SENDGRID_INVOICE_TEMPLATE_ID is not set");

/* ------------------------------------------------------------------ */
/* Types + runtime guards (no `any`) */
/* ------------------------------------------------------------------ */

type VehicleInfo = {
  year?: string;
  make?: string;
  model?: string;
  vin?: string;
  license_plate?: string;
  unit_number?: string;
  mileage?: string;
  color?: string;
  engine_hours?: string;
};

type CustomerInfo = {
  name?: string;
  phone?: string;
  email?: string;
  business_name?: string;
  street?: string;
  city?: string;
  province?: string;
  postal_code?: string;
};

type ShopInfo = {
  name?: string;
  phone_number?: string;
  email?: string;
  street?: string;
  city?: string;
  province?: string;
  postal_code?: string;
};

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

type SendInvoiceResponse = { ok?: boolean; error?: string };

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

  const out: VehicleInfo = {};

  const year = asString(x.year)?.trim();
  const make = asString(x.make)?.trim();
  const model = asString(x.model)?.trim();
  const vin = asString(x.vin)?.trim();

  const license_plate = asString(x.license_plate)?.trim();
  const unit_number = asString(x.unit_number)?.trim();
  const mileage = asString(x.mileage)?.trim();
  const color = asString(x.color)?.trim();
  const engine_hours = asString(x.engine_hours)?.trim();

  if (year) out.year = year;
  if (make) out.make = make;
  if (model) out.model = model;
  if (vin) out.vin = vin;

  if (license_plate) out.license_plate = license_plate;
  if (unit_number) out.unit_number = unit_number;
  if (mileage) out.mileage = mileage;
  if (color) out.color = color;
  if (engine_hours) out.engine_hours = engine_hours;

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
    const labor_time_str = typeof labor_time_raw === "string" ? labor_time_raw.trim() : undefined;

    const lineId =
      (typeof item.lineId === "string" ? item.lineId.trim() : undefined) ??
      (typeof item.id === "string" ? item.id.trim() : undefined) ??
      (typeof item.line_id === "string" ? item.line_id.trim() : undefined) ??
      (typeof item.work_order_line_id === "string" ? item.work_order_line_id.trim() : undefined);

    out.push({
      complaint: complaint?.length ? complaint : null,
      cause: cause?.length ? cause : null,
      correction: correction?.length ? correction : null,
      labor_time:
        labor_time_num !== undefined ? labor_time_num : labor_time_str?.length ? labor_time_str : null,
      lineId: lineId?.length ? lineId : null,
    });
  }

  return out.length > 0 ? out : undefined;
}

type ParsedBody =
  | { ok: true; body: RequestBody }
  | { ok: false; error: string; status: number };

function parseRequestBody(raw: unknown): ParsedBody {
  if (!isRecord(raw)) return { ok: false, error: "Invalid JSON body", status: 400 };

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

  return {
    ok: true,
    body: {
      workOrderId,
      customerEmail,
      invoiceTotal,
      customerName,
      shopName,
      vehicleInfo,
      lines,
    },
  };
}

function joinName(first?: string | null, last?: string | null): string | undefined {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const s = [f, l].filter(Boolean).join(" ").trim();
  return s.length ? s : undefined;
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

function pickCustomerPhone(c?: Pick<CustomerRow, "phone" | "phone_number"> | null): string | undefined {
  const p1 = (c?.phone_number ?? "").trim();
  const p2 = (c?.phone ?? "").trim();
  const out = p1 || p2;
  return out.length ? out : undefined;
}

/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  try {
    const raw = (await req.json().catch(() => null)) as unknown;

    const parsed = parseRequestBody(raw);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const { workOrderId, customerEmail, invoiceTotal, customerName, shopName, lines, vehicleInfo } =
      parsed.body;

    if (!SENDGRID_API_KEY || !SENDGRID_TEMPLATE_ID) {
      return NextResponse.json({ error: "Email service is not configured" }, { status: 500 });
    }

    // ------------------------------------------------------------------
    // 1) Fetch work order (for totals + relations)
    // ------------------------------------------------------------------
    const { data: wo, error: woErr } = await supabaseAdmin
      .from("work_orders")
      .select("id, shop_id, customer_id, vehicle_id, labor_total, parts_total, invoice_total, customer_name")
      .eq("id", workOrderId)
      .maybeSingle<
        Pick<
          WorkOrderRow,
          | "id"
          | "shop_id"
          | "customer_id"
          | "vehicle_id"
          | "labor_total"
          | "parts_total"
          | "invoice_total"
          | "customer_name"
        >
      >();

    if (woErr || !wo) {
      return NextResponse.json({ error: "Invalid work order" }, { status: 404 });
    }

    // compute totals (prefer client-provided invoiceTotal, then DB invoice_total, else labor+parts)
    const laborTotal = Number(wo.labor_total ?? 0);
    const partsTotal = Number(wo.parts_total ?? 0);
    const computedInvoiceTotal =
      typeof invoiceTotal === "number" && Number.isFinite(invoiceTotal) && invoiceTotal > 0
        ? invoiceTotal
        : Number(wo.invoice_total ?? 0) > 0
          ? Number(wo.invoice_total ?? 0)
          : laborTotal + partsTotal;

    // ------------------------------------------------------------------
    // 2) Fetch shop details (header + contact)
    // ------------------------------------------------------------------
    const { data: shop, error: shopErr } = await supabaseAdmin
      .from("shops")
      .select("business_name, shop_name, name, phone_number, email, street, city, province, postal_code")
      .eq("id", wo.shop_id)
      .maybeSingle<
        Pick<
          ShopRow,
          "business_name" | "shop_name" | "name" | "phone_number" | "email" | "street" | "city" | "province" | "postal_code"
        >
      >();

    if (shopErr) {
      // non-fatal
      console.warn("[invoices/send] shops lookup failed:", shopErr.message);
    }

    const resolvedShopName = (shopName ?? "").trim() || pickShopName(shop ?? null) || "ProFixIQ";

    const shopInfo: ShopInfo = {
      name: resolvedShopName,
      phone_number: (shop?.phone_number ?? "").trim() || undefined,
      email: (shop?.email ?? "").trim() || undefined,
      street: (shop?.street ?? "").trim() || undefined,
      city: (shop?.city ?? "").trim() || undefined,
      province: (shop?.province ?? "").trim() || undefined,
      postal_code: (shop?.postal_code ?? "").trim() || undefined,
    };

    // ------------------------------------------------------------------
    // 3) Resolve portal user + fetch customer details
    // ------------------------------------------------------------------
    let portalUserId: string | null = null;
    let portalCustomerId: string | null = null;

    let customerInfo: CustomerInfo | undefined = undefined;

    if (wo.customer_id) {
      const { data: customer, error: customerErr } = await supabaseAdmin
        .from("customers")
        .select("id, user_id, name, first_name, last_name, phone, phone_number, email, business_name, street, city, province, postal_code")
        .eq("id", wo.customer_id)
        .maybeSingle<
          Pick<
            CustomerRow,
            | "id"
            | "user_id"
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

      if (!customerErr && customer) {
        portalCustomerId = customer.id;
        portalUserId = customer.user_id ?? null;

        const resolvedCustomerName =
          (customerName ?? "").trim() ||
          (customer.name ?? "").trim() ||
          joinName(customer.first_name ?? null, customer.last_name ?? null) ||
          (wo.customer_name ?? "").trim() ||
          undefined;

        customerInfo = {
          name: resolvedCustomerName,
          phone: pickCustomerPhone(customer),
          email: (customer.email ?? "").trim() || undefined,
          business_name: (customer.business_name ?? "").trim() || undefined,
          street: (customer.street ?? "").trim() || undefined,
          city: (customer.city ?? "").trim() || undefined,
          province: (customer.province ?? "").trim() || undefined,
          postal_code: (customer.postal_code ?? "").trim() || undefined,
        };
      }
    }

    // ------------------------------------------------------------------
    // 4) Fetch vehicle details (if we didn't get them from request)
    // ------------------------------------------------------------------
    let resolvedVehicleInfo: VehicleInfo | undefined = vehicleInfo;

    if (!resolvedVehicleInfo && wo.vehicle_id) {
      const { data: v, error: vErr } = await supabaseAdmin
        .from("vehicles")
        .select("year, make, model, vin, license_plate, unit_number, mileage, color, engine_hours")
        .eq("id", wo.vehicle_id)
        .maybeSingle<
          Pick<
            VehicleRow,
            "year" | "make" | "model" | "vin" | "license_plate" | "unit_number" | "mileage" | "color" | "engine_hours"
          >
        >();

      if (!vErr && v) {
        resolvedVehicleInfo = {
          year: v.year !== null && v.year !== undefined ? String(v.year) : undefined,
          make: (v.make ?? "").trim() || undefined,
          model: (v.model ?? "").trim() || undefined,
          vin: (v.vin ?? "").trim() || undefined,
          license_plate: (v.license_plate ?? "").trim() || undefined,
          unit_number: (v.unit_number ?? "").trim() || undefined,
          mileage: (v.mileage ?? "").trim() || undefined,
          color: (v.color ?? "").trim() || undefined,
          engine_hours:
            v.engine_hours !== null && v.engine_hours !== undefined ? String(v.engine_hours) : undefined,
        };
      }
    }

    // ------------------------------------------------------------------
    // 5) Portal URL (ABSOLUTE)
    // ------------------------------------------------------------------
    const base = SITE_URL.trim().replace(/\/+$/, "");
    const portalInvoiceUrl = `${base}/portal/invoices/${workOrderId}`;

    // ------------------------------------------------------------------
    // 6) Send invoice email via SendGrid
    // ------------------------------------------------------------------
    const emailPayload = {
      personalizations: [
        {
          to: [{ email: customerEmail }],
          dynamic_template_data: {
            // ids
            workOrderId,

            // names
            customerName: (customerInfo?.name ?? (customerName ?? "").trim()) || null,
            shopName: resolvedShopName,

            // totals
            laborTotal,
            partsTotal,
            invoiceTotal: computedInvoiceTotal,

            // rich info blocks
            customerInfo: customerInfo ?? null,
            vehicleInfo: resolvedVehicleInfo ?? null,
            shopInfo,

            // lines
            lines: lines ?? null,

            // portal link (IMPORTANT: template must use {{{portalUrl}}})
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
      console.error("[invoices/send] SendGrid error:", sgRes.status, sgRes.statusText, resBody);
      throw new Error(`SendGrid error: ${sgRes.status} ${sgRes.statusText}`);
    }

    // ------------------------------------------------------------------
    // 7) Update invoice metadata on the work order
    // ------------------------------------------------------------------
    await supabaseAdmin
      .from("work_orders")
      .update({
        invoice_sent_at: new Date().toISOString(),
        invoice_last_sent_to: customerEmail,
        invoice_total: computedInvoiceTotal,
        invoice_url: portalInvoiceUrl,
      })
      .eq("id", workOrderId);

    // ------------------------------------------------------------------
    // 8) Create portal notification (if we have a portal user)
    // ------------------------------------------------------------------
    if (portalUserId) {
      await supabaseAdmin.from("portal_notifications").insert({
        user_id: portalUserId,
        customer_id: portalCustomerId,
        work_order_id: workOrderId,
        kind: "invoice_ready",
        title: "Invoice ready",
        body: `Your invoice for Work Order ${workOrderId} at ${resolvedShopName} is ready to view in your portal.`,
      });
    }

    return NextResponse.json({ ok: true } satisfies SendInvoiceResponse);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error sending invoice";
    console.error("[invoices/send] Invoice Send Failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}