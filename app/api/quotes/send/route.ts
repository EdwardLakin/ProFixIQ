import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { runPostSendPersistence, sendQuoteReadyEmail } from "@/features/email/server";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type QuoteLineRow = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];

type QuoteLine = { description: string; amount: number };

const SEND_READY_STAGES = new Set(["advisor_pending", "ready_to_send"]);
const SEND_READY_STATUSES = new Set(["advisor_pending", "ready_to_send", "quoted"]);
const NON_SENDABLE_STATUSES = new Set([
  "pending_parts",
  "sent",
  "approved",
  "declined",
  "deferred",
  "converted",
  "rejected",
  "cancelled",
]);

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

function buildVehicleLabel(vehicleInfo?: VehicleInfo): string {
  if (!vehicleInfo) return "";
  const year = vehicleInfo.year != null ? String(vehicleInfo.year).trim() : "";
  const make = safeStr(vehicleInfo.make).trim();
  const model = safeStr(vehicleInfo.model).trim();
  return [year, make, model].filter(Boolean).join(" ");
}

function quoteMetadata(line: Pick<QuoteLineRow, "metadata">): Record<string, unknown> {
  if (!line.metadata || typeof line.metadata !== "object" || Array.isArray(line.metadata)) {
    return {};
  }
  return line.metadata as Record<string, unknown>;
}

function quoteLaborHours(line: Pick<QuoteLineRow, "labor_hours" | "est_labor_hours">): number {
  return asNumber(line.labor_hours) ?? asNumber(line.est_labor_hours) ?? 0;
}

function quoteLaborRate(line: Pick<QuoteLineRow, "metadata">, shopLaborRate: number): number {
  return asNumber(quoteMetadata(line).labor_rate) ?? shopLaborRate;
}

function quoteLaborTotal(
  line: Pick<QuoteLineRow, "labor_total" | "labor_hours" | "est_labor_hours" | "metadata">,
  shopLaborRate: number,
): number {
  return asNumber(line.labor_total) ?? quoteLaborHours(line) * quoteLaborRate(line, shopLaborRate);
}

function quotePartsTotal(line: Pick<QuoteLineRow, "parts_total">): number {
  return asNumber(line.parts_total) ?? 0;
}

function quoteGrandTotal(
  line: Pick<
    QuoteLineRow,
    "grand_total" | "subtotal" | "labor_total" | "labor_hours" | "est_labor_hours" | "metadata" | "parts_total"
  >,
  shopLaborRate: number,
): number {
  return (
    asNumber(line.grand_total) ??
    asNumber(line.subtotal) ??
    quoteLaborTotal(line, shopLaborRate) + quotePartsTotal(line)
  );
}

function isSendableQuoteLine(line: Pick<QuoteLineRow, "status" | "stage" | "sent_to_customer_at" | "approved_at" | "declined_at" | "work_order_line_id">): boolean {
  const status = safeStr(line.status).trim().toLowerCase();
  const stage = safeStr(line.stage).trim().toLowerCase();
  if (line.sent_to_customer_at || line.approved_at || line.declined_at || line.work_order_line_id) return false;
  if (NON_SENDABLE_STATUSES.has(status)) return false;
  return SEND_READY_STATUSES.has(status) || SEND_READY_STAGES.has(stage);
}

export async function POST(req: Request) {
  const trace = `quotes-send:${Date.now()}:${Math.random().toString(16).slice(2)}`;

  try {

    const access = await requireShopScopedApiAccess({
      requiredCapability: "canAuthorizeQuotes",
    });
    if (!access.ok) {
      const payload = await access.response.json().catch(() => ({ error: "Forbidden" }));
      return NextResponse.json(
        { ok: false, trace, error: safeStr(payload?.error) || "Forbidden" },
        { status: access.response.status },
      );
    }
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

    const { data: wo, error: woErr } = await supabaseAdmin
      .from("work_orders")
      .select("id, customer_id, shop_id, vehicle_id, quote_url")
      .eq("id", workOrderId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle<
        Pick<
          WorkOrderRow,
          "id" | "customer_id" | "shop_id" | "vehicle_id" | "quote_url"
        >
      >();

    if (woErr) {
      return NextResponse.json(
        {
          ok: false,
          trace,
          error: "Failed to load work order",
          detail: woErr.message,
        },
        { status: 400 },
      );
    }

    if (!wo) {
      return NextResponse.json(
        { ok: false, trace, error: "Invalid work order" },
        { status: 404 },
      );
    }

    if (!wo.shop_id) {
      return NextResponse.json(
        { ok: false, trace, error: "Work order is missing shop_id" },
        { status: 400 },
      );
    }


    let portalUserId: string | null = null;
    let portalCustomerId: string | null = null;
    let customerEmail = safeStr(body?.customerEmail).trim() || "";
    let customerName = safeStr(body?.customerName).trim() || "";

    // Service-role client is intentionally retained after canonical shop-scoped auth
    // for privileged quote-send side effects (email/persistence/notifications).
    if (wo.customer_id) {
      const { data: customer, error: customerErr } = await supabaseAdmin
        .from("customers")
        .select("id, user_id, email, first_name, last_name, business_name")
        .eq("id", wo.customer_id)
        .maybeSingle<
          Pick<
            CustomerRow,
            "id" | "user_id" | "email" | "first_name" | "last_name" | "business_name"
          >
        >();

      if (!customerErr && customer) {
        portalCustomerId = customer.id;
        portalUserId = customer.user_id ?? null;

        if (!customerEmail) customerEmail = safeStr(customer.email).trim();
        if (!customerName) customerName = buildCustomerName(customer);
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

    let shopName = safeStr(body?.shopName).trim() || "";
    let laborRate = 0;
    let brand: Awaited<ReturnType<typeof getActiveBrandForRender>> | null = null;

    if (wo.shop_id) {
      const { data: shop, error: shopErr } = await supabaseAdmin
        .from("shops")
        .select("name, shop_name, labor_rate")
        .eq("id", wo.shop_id)
        .maybeSingle<
          Pick<ShopRow, "name" | "shop_name" | "labor_rate">
        >();

      if (!shopErr && shop) {
        shopName =
          shopName ||
          safeStr(shop.shop_name).trim() ||
          safeStr(shop.name).trim();
        laborRate = asNumber(shop.labor_rate) ?? 0;
      }

      brand = await getActiveBrandForRender(wo.shop_id);
    }

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

    let lines: QuoteLine[] | undefined = body?.lines;
    let quoteTotal: number | undefined = body?.quoteTotal;
    let sendableQuoteLineIds: string[] = [];

    const { data: quoteLineRowsRaw, error: quoteLinesErr } = await supabaseAdmin
      .from("work_order_quote_lines")
      .select(
        "id, description, ai_complaint, notes, labor_hours, est_labor_hours, labor_total, parts_total, subtotal, grand_total, status, stage, sent_to_customer_at, approved_at, declined_at, work_order_line_id, metadata",
      )
      .eq("shop_id", wo.shop_id)
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: true });

    if (quoteLinesErr) {
      return NextResponse.json(
        {
          ok: false,
          trace,
          error: "Failed to load canonical quote lines",
          detail: quoteLinesErr.message,
        },
        { status: 500 },
      );
    }

    const quoteLineRows = (quoteLineRowsRaw ?? []) as Array<
      Pick<
        QuoteLineRow,
        | "id"
        | "description"
        | "ai_complaint"
        | "notes"
        | "labor_hours"
        | "est_labor_hours"
        | "labor_total"
        | "parts_total"
        | "subtotal"
        | "grand_total"
        | "status"
        | "stage"
        | "sent_to_customer_at"
        | "approved_at"
        | "declined_at"
        | "work_order_line_id"
        | "metadata"
      >
    >;

    const sendableQuoteLines = quoteLineRows.filter(isSendableQuoteLine);

    if (sendableQuoteLines.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          trace,
          error:
            "No canonical quote lines are ready to send. Mark advisor-reviewed lines ready_to_send/quoted after parts pricing is complete.",
        },
        { status: 409 },
      );
    }

    const computed = sendableQuoteLines.map((line) => {
      const amount = quoteGrandTotal(line, laborRate);
      const description =
        safeStr(line.description).trim() ||
        safeStr(line.ai_complaint).trim() ||
        safeStr(line.notes).trim() ||
        "Quote line";
      return { description, amount } satisfies QuoteLine;
    });

    const computedTotal = computed.reduce((sum, line) => sum + line.amount, 0);
    sendableQuoteLineIds = sendableQuoteLines.map((line) => line.id);

    if (!lines || lines.length === 0) lines = computed;
    if (typeof quoteTotal !== "number") quoteTotal = computedTotal;
    const pdfUrl = body?.pdfUrl ?? null;

    const appUrlEnv =
      process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    const normalizedAppUrl = appUrlEnv ? appUrlEnv.replace(/\/$/, "") : "";
    const portalQuoteUrl = normalizedAppUrl
      ? `${normalizedAppUrl}/portal/quotes/${workOrderId}`
      : null;

    const requestAllowsResend = req.headers.get("x-profix-resend") === "1";
    const quoteUrlForSend = portalQuoteUrl ?? pdfUrl ?? wo.quote_url ?? "";
    const shouldSkipAsDuplicate = Boolean(wo.quote_url) && wo.quote_url === quoteUrlForSend && !requestAllowsResend;

    if (!shouldSkipAsDuplicate) {
      await sendQuoteReadyEmail({
      shopId: wo.shop_id,
      to: customerEmail,
      quoteUrl: quoteUrlForSend,
      quoteTotal: quoteTotal ?? null,
      vehicleLabel: buildVehicleLabel(vehicleInfo),
      shopName: shopName || undefined,
      brandLogoUrl: brand?.logoUrl ?? null,
      brandPrimaryColor: brand?.colors.primary ?? null,
      brandSecondaryColor: brand?.colors.secondary ?? null,
    });
    }

    const newQuoteUrl = portalQuoteUrl ?? pdfUrl ?? wo.quote_url ?? null;

    const postSendWarnings = await runPostSendPersistence([
      ...(newQuoteUrl !== wo.quote_url
        ? [
            {
              step: "work_order_quote_url_update",
              run: async () => {
                const { error } = await supabaseAdmin
                  .from("work_orders")
                  .update({ quote_url: newQuoteUrl })
                  .eq("id", workOrderId)
                  .eq("shop_id", wo.shop_id);
                if (error) throw new Error(error.message);
              },
            },
          ]
        : []),
      ...(sendableQuoteLineIds.length > 0
        ? [
            {
              step: "work_order_quote_lines_mark_sent",
              run: async () => {
                const sentAt = new Date().toISOString();
                const { error } = await supabaseAdmin
                  .from("work_order_quote_lines")
                  .update({
                    status: "sent",
                    stage: "sent",
                    sent_to_customer_at: sentAt,
                    updated_at: sentAt,
                  })
                  .eq("shop_id", wo.shop_id)
                  .eq("work_order_id", workOrderId)
                  .in("id", sendableQuoteLineIds);
                if (error) throw new Error(error.message);
              },
            },
          ]
        : []),
      ...(portalUserId
        ? [
            {
              step: "portal_quote_notification_insert",
              run: async () => {
                const { error } = await supabaseAdmin
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
                if (error) throw new Error(error.message);
              },
            },
          ]
        : []),
    ]);

    if (postSendWarnings.length > 0) {
      return NextResponse.json({
        ok: true,
        trace,
        deduped: shouldSkipAsDuplicate,
        sentWithWarnings: true,
        warnings: postSendWarnings,
      });
    }

    return NextResponse.json({ ok: true, trace, deduped: shouldSkipAsDuplicate });
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
