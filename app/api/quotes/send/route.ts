import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { runPostSendPersistence, sendQuoteReadyEmail } from "@/features/email/server";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";

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

    if (!lines || lines.length === 0 || typeof quoteTotal !== "number") {
      const { data: lineRowsRaw, error: linesErr } = await supabaseAdmin
        .from("work_order_lines")
        .select("id, description, complaint, labor_time, price_estimate, line_no")
        .eq("work_order_id", workOrderId)
        .order("line_no", { ascending: true });

      if (linesErr) {
        return NextResponse.json(
          {
            ok: false,
            trace,
            error: "Failed to load work order lines",
            detail: linesErr.message,
          },
          { status: 500 },
        );
      }

      const lineRows = (lineRowsRaw ?? []) as Array<
        Pick<
          LineRow,
          "id" | "description" | "complaint" | "labor_time" | "price_estimate" | "line_no"
        >
      >;

      const lineIds = lineRows
        .map((l) => l.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      let allocRows: Array<
        Pick<AllocRow, "work_order_line_id" | "qty" | "unit_cost">
      > = [];

      if (lineIds.length > 0) {
        const { data: allocsRes, error: allocErr } = await supabaseAdmin
          .from("work_order_part_allocations")
          .select("work_order_line_id, qty, unit_cost")
          .in("work_order_line_id", lineIds);

        if (allocErr) {
          return NextResponse.json(
            {
              ok: false,
              trace,
              error: "Failed to load part allocations",
              detail: allocErr.message,
            },
            { status: 500 },
          );
        }

        allocRows = (allocsRes ?? []) as Array<
          Pick<AllocRow, "work_order_line_id" | "qty" | "unit_cost">
        >;
      }

      const partsByLine = new Map<string, number>();
      for (const a of allocRows) {
        const lineId = a.work_order_line_id;
        if (!lineId) continue;

        const qty = typeof a.qty === "number" ? a.qty : Number(a.qty);
        const unit = typeof a.unit_cost === "number" ? a.unit_cost : Number(a.unit_cost);

        const q = Number.isFinite(qty) ? qty : 0;
        const u = Number.isFinite(unit) ? unit : 0;

        const prev = partsByLine.get(lineId) ?? 0;
        partsByLine.set(lineId, prev + q * u);
      }

      const computed: QuoteLine[] = [];
      let computedTotal = 0;

      for (const line of lineRows) {
        const hrs =
          typeof line.labor_time === "number" && Number.isFinite(line.labor_time)
            ? line.labor_time
            : 0;

        const laborAmt = hrs * laborRate;
        const partsAmt = partsByLine.get(line.id) ?? 0;

        const priceEstimate =
          typeof line.price_estimate === "number" && Number.isFinite(line.price_estimate)
            ? line.price_estimate
            : null;

        const amount = priceEstimate != null ? priceEstimate : laborAmt + partsAmt;
        computedTotal += amount;

        const desc =
          safeStr(line.description).trim() ||
          safeStr(line.complaint).trim() ||
          "Job";

        computed.push({ description: desc, amount });
      }

      if (!lines || lines.length === 0) lines = computed;
      if (typeof quoteTotal !== "number") quoteTotal = computedTotal;
    }

    const pdfUrl = body?.pdfUrl ?? null;

    const appUrlEnv =
      process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    const normalizedAppUrl = appUrlEnv ? appUrlEnv.replace(/\/$/, "") : "";
    const portalQuoteUrl = normalizedAppUrl
      ? `${normalizedAppUrl}/portal/quotes/${workOrderId}`
      : null;

    await sendQuoteReadyEmail({
      shopId: wo.shop_id,
      to: customerEmail,
      quoteUrl: portalQuoteUrl ?? pdfUrl ?? wo.quote_url ?? "",
      quoteTotal: quoteTotal ?? null,
      vehicleLabel: buildVehicleLabel(vehicleInfo),
      shopName: shopName || undefined,
      brandLogoUrl: brand?.logoUrl ?? null,
      brandPrimaryColor: brand?.colors.primary ?? null,
      brandSecondaryColor: brand?.colors.secondary ?? null,
    });

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
                  .eq("id", workOrderId);
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
        sentWithWarnings: true,
        warnings: postSendWarnings,
      });
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
