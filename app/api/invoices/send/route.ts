import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  runPostSendPersistence,
  sendInvoiceReadyEmail,
} from "@/features/email/server";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";
import { getInvoiceSnapshotForWorkOrder } from "@/features/invoices/server/getInvoiceSnapshot";
import { reviewWorkOrder } from "../../work-orders/[id]/_lib/reviewWorkOrder";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];

const supabaseAdmin = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com";

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

type InvoiceLinePayload = {
  complaint?: string | null;
  cause?: string | null;
  correction?: string | null;
  labor_time?: string | number | null;
  lineId?: string | null;
};

type RequestBody = {
  workOrderId: string;
  customerEmail?: string;
  invoiceTotal?: number;
  customerName?: string;
  shopName?: string;
  lines?: InvoiceLinePayload[];
  vehicleInfo?: VehicleInfo;
  signatureImage?: string;
};

type SendInvoiceResponse = {
  ok?: boolean;
  error?: string;
  sentWithWarnings?: boolean;
  warnings?: Array<{ step: string; message: string }>;
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

    const laborTimeRaw = item.labor_time;
    const laborTimeNum = asNumber(laborTimeRaw);
    const laborTimeStr =
      typeof laborTimeRaw === "string" ? laborTimeRaw.trim() : undefined;

    const lineId =
      (typeof item.lineId === "string" ? item.lineId.trim() : undefined) ??
      (typeof item.id === "string" ? String(item.id).trim() : undefined) ??
      (typeof item.line_id === "string" ? String(item.line_id).trim() : undefined) ??
      (typeof item.work_order_line_id === "string"
        ? String(item.work_order_line_id).trim()
        : undefined);

    out.push({
      complaint: complaint?.length ? complaint : null,
      cause: cause?.length ? cause : null,
      correction: correction?.length ? correction : null,
      labor_time:
        laborTimeNum !== undefined
          ? laborTimeNum
          : laborTimeStr?.length
            ? laborTimeStr
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
  const customerEmail = asString(raw.customerEmail)?.trim();

  if (!workOrderId) {
    return { ok: false, error: "Missing work order ID", status: 400 };
  }

  const invoiceTotal = asNumber(raw.invoiceTotal);
  const customerName = asString(raw.customerName)?.trim();
  const shopName = asString(raw.shopName)?.trim();
  const vehicleInfo = sanitizeVehicleInfo(raw.vehicleInfo);
  const lines = sanitizeLines(raw.lines);
  const signatureImage =
    typeof raw.signatureImage === "string" && raw.signatureImage.trim().length
      ? raw.signatureImage.trim()
      : undefined;

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
      signatureImage,
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

function pickCustomerPhone(
  c?: Pick<CustomerRow, "phone" | "phone_number"> | null,
): string | undefined {
  const p1 = (c?.phone_number ?? "").trim();
  const p2 = (c?.phone ?? "").trim();
  const out = p1 || p2;
  return out.length ? out : undefined;
}

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapabilities: ["canManageWorkOrders", "canAuthorizeQuotes"],
      allowRoles: ["owner", "admin", "manager", "advisor", "service"],
    });
    if (!access.ok) return access.response;

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
      signatureImage,
    } = parsed.body;

    const { data: wo, error: woErr } = await supabaseAdmin
      .from("work_orders")
      .select(
        "id, shop_id, customer_id, vehicle_id, labor_total, parts_total, invoice_total, customer_name, status",
      )
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
          | "status"
        >
      >();

    if (woErr || !wo) {
      return NextResponse.json({ error: "Invalid work order" }, { status: 404 });
    }

    if (!wo.shop_id) {
      return NextResponse.json({ error: "Work order is missing shop_id" }, { status: 400 });
    }

    if (wo.shop_id !== access.profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = String(wo.status ?? "").toLowerCase().replaceAll(" ", "_");
    if (!["completed", "ready_to_invoice", "invoiced"].includes(status)) {
      return NextResponse.json(
        { error: `Work order status ${wo.status ?? "unknown"} is not ready for invoicing` },
        { status: 409 },
      );
    }

    const review = await reviewWorkOrder({
      supabase: supabaseAdmin,
      workOrderId,
      shopId: wo.shop_id,
      kind: "invoice_review",
    });

    if (!review.ok) {
      return NextResponse.json(
        {
          error: "Invoice review failed. Resolve blocking issues before sending.",
          issues: review.issues,
        },
        { status: 400 },
      );
    }

    const snapshot = await getInvoiceSnapshotForWorkOrder({
      supabase: supabaseAdmin,
      workOrderId,
    });

    const computedInvoiceTotal =
      typeof invoiceTotal === "number" &&
      Number.isFinite(invoiceTotal) &&
      invoiceTotal > 0
        ? invoiceTotal
        : snapshot.total != null && Number.isFinite(snapshot.total) && snapshot.total > 0
          ? snapshot.total
          : Number(wo.invoice_total ?? 0) > 0
            ? Number(wo.invoice_total ?? 0)
            : 0;

    const laborTotal =
      snapshot.laborCost != null && Number.isFinite(snapshot.laborCost)
        ? snapshot.laborCost
        : Number(wo.labor_total ?? 0);

    const partsTotal =
      snapshot.partsCost != null && Number.isFinite(snapshot.partsCost)
        ? snapshot.partsCost
        : Number(wo.parts_total ?? 0);

    if (!(computedInvoiceTotal > 0)) {
      return NextResponse.json(
        { error: "Cannot send invoice with a zero total. Add labor/parts before invoicing." },
        { status: 400 },
      );
    }

    const { data: shop, error: shopErr } = await supabaseAdmin
      .from("shops")
      .select(
        "business_name, shop_name, name, phone_number, email, street, city, province, postal_code",
      )
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

    if (shopErr) {
      console.warn("[invoices/send] shops lookup failed:", shopErr.message);
    }

    let brand: Awaited<ReturnType<typeof getActiveBrandForRender>> | null = null;
    const resolvedShopName =
      (shopName ?? "").trim() || pickShopName(shop ?? null) || "ProFixIQ";

    if (wo.shop_id) {
      brand = await getActiveBrandForRender(wo.shop_id);
    }

    let portalUserId: string | null = null;
    let portalCustomerId: string | null = null;

    let resolvedCustomerInfo: CustomerInfo | undefined = undefined;
    const payloadCustomerEmail = (customerEmail ?? "").trim().toLowerCase();
    let resolvedCustomerEmail = payloadCustomerEmail.length ? payloadCustomerEmail : "";

    if (wo.customer_id) {
      const { data: customer, error: customerErr } = await supabaseAdmin
        .from("customers")
        .select(
          "id, user_id, name, first_name, last_name, phone, phone_number, email, business_name, street, city, province, postal_code",
        )
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

        resolvedCustomerInfo = {
          name: resolvedCustomerName,
          phone: pickCustomerPhone(customer),
          email: (customer.email ?? "").trim() || undefined,
          business_name: (customer.business_name ?? "").trim() || undefined,
          street: (customer.street ?? "").trim() || undefined,
          city: (customer.city ?? "").trim() || undefined,
          province: (customer.province ?? "").trim() || undefined,
          postal_code: (customer.postal_code ?? "").trim() || undefined,
        };

        if (!resolvedCustomerEmail) {
          resolvedCustomerEmail = (customer.email ?? "").trim().toLowerCase();
        }
      }
    }

    if (!resolvedCustomerEmail) {
      return NextResponse.json(
        { error: "Missing customer email. Add an email to the customer before invoicing." },
        { status: 400 },
      );
    }

    let resolvedVehicleInfo: VehicleInfo | undefined = vehicleInfo;

    if (!resolvedVehicleInfo && wo.vehicle_id) {
      const { data: vehicle, error: vehicleErr } = await supabaseAdmin
        .from("vehicles")
        .select(
          "year, make, model, vin, license_plate, unit_number, mileage, color, engine_hours",
        )
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

      if (!vehicleErr && vehicle) {
        resolvedVehicleInfo = {
          year: vehicle.year !== null && vehicle.year !== undefined ? String(vehicle.year) : undefined,
          make: (vehicle.make ?? "").trim() || undefined,
          model: (vehicle.model ?? "").trim() || undefined,
          vin: (vehicle.vin ?? "").trim() || undefined,
          license_plate: (vehicle.license_plate ?? "").trim() || undefined,
          unit_number: (vehicle.unit_number ?? "").trim() || undefined,
          mileage: (vehicle.mileage ?? "").trim() || undefined,
          color: (vehicle.color ?? "").trim() || undefined,
          engine_hours:
            vehicle.engine_hours !== null && vehicle.engine_hours !== undefined
              ? String(vehicle.engine_hours)
              : undefined,
        };
      }
    }

    const base = SITE_URL.trim().replace(/\/+$/, "");
    const portalInvoiceUrl = `${base}/portal/invoices/${workOrderId}`;
    const invoicePdfUrl = `${base}/api/work-orders/${workOrderId}/invoice-pdf?download=1`;

    await sendInvoiceReadyEmail({
      shopId: wo.shop_id,
      to: resolvedCustomerEmail,
      portalUrl: portalInvoiceUrl,
      workOrderId,
      invoiceTotal: computedInvoiceTotal,
      laborTotal,
      partsTotal,
      customerName:
        (resolvedCustomerInfo?.name ?? (customerName ?? "").trim()) || undefined,
      shopName: resolvedShopName,
      brandLogoUrl: brand?.logoUrl ?? null,
      brandPrimaryColor: brand?.colors.primary ?? null,
      brandSecondaryColor: brand?.colors.secondary ?? null,
    });

    const postSendWarnings = await runPostSendPersistence([
      {
        step: "work_order_invoice_state_update",
        run: async () => {
          const { error } = await supabaseAdmin
            .from("work_orders")
            .update({
              status: "invoiced",
              invoice_sent_at: new Date().toISOString(),
              invoice_last_sent_to: resolvedCustomerEmail,
              invoice_total: computedInvoiceTotal,
              invoice_url: portalInvoiceUrl,
              invoice_pdf_url: invoicePdfUrl,
            } as DB["public"]["Tables"]["work_orders"]["Update"])
            .eq("id", workOrderId);
          if (error) throw new Error(error.message);
        },
      },
      {
        step: "invoice_sent_audit_log",
        run: async () => {
          await logOperationalEvent({
            supabase: supabaseAdmin,
            event: "invoice_sent",
            entityType: "work_order",
            entityId: workOrderId,
            details: {
              invoice_total: computedInvoiceTotal,
              labor_total: laborTotal,
              parts_total: partsTotal,
              recipient: resolvedCustomerEmail,
            },
          });
        },
      },
      ...(portalUserId
        ? [
            {
              step: "portal_invoice_notification_insert",
              run: async () => {
                const { error } = await supabaseAdmin
                  .from("portal_notifications")
                  .insert({
                    user_id: portalUserId,
                    customer_id: portalCustomerId,
                    work_order_id: workOrderId,
                    kind: "invoice_ready",
                    title: "Invoice ready",
                    body: `Your invoice for Work Order ${workOrderId} at ${resolvedShopName} is ready to view in your portal.`,
                  });
                if (error) throw new Error(error.message);
              },
            },
          ]
        : []),
    ]);

    if (postSendWarnings.length > 0) {
      return NextResponse.json({
        ok: true,
        sentWithWarnings: true,
        warnings: postSendWarnings,
      } satisfies SendInvoiceResponse);
    }

    void lines;
    void resolvedVehicleInfo;
    void signatureImage;

    return NextResponse.json({ ok: true } satisfies SendInvoiceResponse);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error sending invoice";
    console.error("[invoices/send] Invoice Send Failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
