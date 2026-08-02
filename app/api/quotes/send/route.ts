import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import {
  runPostSendPersistence,
  sendQuoteReadyEmail,
} from "@/features/email/server";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";
import {
  calculateTax,
  getTaxAmount,
  isProvinceCode,
} from "@/features/integrations/tax";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  calculateShopSupplies,
  resolveShopSuppliesOverride,
  resolveShopSuppliesSettings,
  shopSuppliesTaxableSubtotal,
} from "@/features/work-orders/lib/shopSupplies";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderUpdate = DB["public"]["Tables"]["work_orders"]["Update"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type QuoteLineRow = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type EstimateEventRow = DB["public"]["Tables"]["estimate_events"]["Row"];
type EmailLogRow = DB["public"]["Tables"]["email_logs"]["Row"];

type EstimateSendEvent = Pick<
  EstimateEventRow,
  | "id"
  | "work_order_id"
  | "revision"
  | "event_type"
  | "idempotency_key"
  | "actor_profile_id"
  | "result"
  | "snapshot"
  | "created_at"
  | "updated_at"
>;

type QuoteLine = { description: string; amount: number };

class QuoteDeliveryBlockedError extends Error {
  readonly status = 409;
}

const SEND_READY_STAGES = new Set(["advisor_pending", "ready_to_send"]);
const SEND_READY_STATUSES = new Set([
  "advisor_pending",
  "ready_to_send",
  "quoted",
]);
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

function buildCustomerName(
  customer: {
    first_name?: string | null;
    last_name?: string | null;
    business_name?: string | null;
  } | null,
): string {
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

function quoteMetadata(
  line: Pick<QuoteLineRow, "metadata">,
): Record<string, unknown> {
  if (
    !line.metadata ||
    typeof line.metadata !== "object" ||
    Array.isArray(line.metadata)
  ) {
    return {};
  }
  return line.metadata as Record<string, unknown>;
}

function quoteLaborHours(
  line: Pick<QuoteLineRow, "labor_hours" | "est_labor_hours">,
): number {
  return asNumber(line.labor_hours) ?? asNumber(line.est_labor_hours) ?? 0;
}

function quoteLaborRate(
  line: Pick<QuoteLineRow, "metadata">,
  shopLaborRate: number,
): number {
  return asNumber(quoteMetadata(line).labor_rate) ?? shopLaborRate;
}

function quoteLaborTotal(
  line: Pick<
    QuoteLineRow,
    "labor_total" | "labor_hours" | "est_labor_hours" | "metadata"
  >,
  shopLaborRate: number,
): number {
  return (
    asNumber(line.labor_total) ??
    quoteLaborHours(line) * quoteLaborRate(line, shopLaborRate)
  );
}

function quotePartsTotal(line: Pick<QuoteLineRow, "parts_total">): number {
  return asNumber(line.parts_total) ?? 0;
}

function quoteGrandTotal(
  line: Pick<
    QuoteLineRow,
    | "grand_total"
    | "subtotal"
    | "labor_total"
    | "labor_hours"
    | "est_labor_hours"
    | "metadata"
    | "parts_total"
  >,
  shopLaborRate: number,
): number {
  return (
    asNumber(line.grand_total) ??
    asNumber(line.subtotal) ??
    quoteLaborTotal(line, shopLaborRate) + quotePartsTotal(line)
  );
}

function isSendableQuoteLine(
  line: Pick<
    QuoteLineRow,
    | "status"
    | "stage"
    | "sent_to_customer_at"
    | "approved_at"
    | "declined_at"
    | "work_order_line_id"
  >,
): boolean {
  const status = safeStr(line.status).trim().toLowerCase();
  const stage = safeStr(line.stage).trim().toLowerCase();
  if (
    line.sent_to_customer_at ||
    line.approved_at ||
    line.declined_at ||
    line.work_order_line_id
  )
    return false;
  if (NON_SENDABLE_STATUSES.has(status)) return false;
  return SEND_READY_STATUSES.has(status) || SEND_READY_STAGES.has(stage);
}

function isResendableQuoteLine(
  line: Pick<
    QuoteLineRow,
    | "status"
    | "sent_to_customer_at"
    | "approved_at"
    | "declined_at"
    | "work_order_line_id"
  >,
): boolean {
  const status = safeStr(line.status).trim().toLowerCase();
  return (
    Boolean(line.sent_to_customer_at) &&
    !line.approved_at &&
    !line.declined_at &&
    !line.work_order_line_id &&
    status === "sent"
  );
}

function isApprovedQuoteLine(
  line: Pick<
    QuoteLineRow,
    "status" | "stage" | "approved_at" | "work_order_line_id"
  >,
): boolean {
  const status = safeStr(line.status).trim().toLowerCase();
  const stage = safeStr(line.stage).trim().toLowerCase();
  return (
    Boolean(line.approved_at || line.work_order_line_id) ||
    status === "approved" ||
    status === "converted" ||
    stage === "customer_approved"
  );
}

async function findEstimateSendEvent(input: {
  shopId: string;
  workOrderId: string;
  revision: number;
  idempotencyKey: string;
}): Promise<{ event: EstimateSendEvent | null; keyConflict: boolean }> {
  const { data: byKey, error: keyError } = await supabaseAdmin
    .from("estimate_events")
    .select(
      "id, work_order_id, revision, event_type, idempotency_key, actor_profile_id, result, snapshot, created_at, updated_at",
    )
    .eq("shop_id", input.shopId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle<EstimateSendEvent>();

  if (keyError)
    throw new Error(
      `Failed to verify estimate send retry: ${keyError.message}`,
    );

  if (byKey) {
    const isSameSend =
      byKey.work_order_id === input.workOrderId &&
      byKey.revision === input.revision &&
      ["send_reserved", "send_failed", "sent"].includes(byKey.event_type);
    return { event: byKey, keyConflict: !isSameSend };
  }

  const { data: byRevision, error: revisionError } = await supabaseAdmin
    .from("estimate_events")
    .select(
      "id, work_order_id, revision, event_type, idempotency_key, actor_profile_id, result, snapshot, created_at, updated_at",
    )
    .eq("shop_id", input.shopId)
    .eq("work_order_id", input.workOrderId)
    .eq("revision", input.revision)
    .in("event_type", ["send_reserved", "sent"])
    .maybeSingle<EstimateSendEvent>();

  if (revisionError) {
    throw new Error(
      `Failed to verify estimate revision delivery: ${revisionError.message}`,
    );
  }

  return { event: byRevision ?? null, keyConflict: false };
}

function jsonRecord(value: Json): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Json | undefined>;
}

function stringArray(value: Json | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && isUuid(item),
  );
}

function portalQuoteUrlFor(workOrderId: string): string | null {
  const appUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ""
  )
    .trim()
    .replace(/\/+$/, "");
  return appUrl ? `${appUrl}/portal/quotes/${workOrderId}` : null;
}

async function upsertEstimatePortalNotification(input: {
  userId: string;
  customerId: string | null;
  workOrderId: string;
  revision: number;
  shopName: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("portal_notifications").upsert(
    {
      user_id: input.userId,
      customer_id: input.customerId,
      work_order_id: input.workOrderId,
      kind: "quote_ready",
      title: "Quote ready",
      body: `Your estimate at ${input.shopName || "the shop"} is ready to review in your portal.`,
      event_key: `estimate:quote_ready:${input.workOrderId}:revision:${input.revision}`,
    },
    { onConflict: "user_id,event_key" },
  );
  if (error) throw new Error(error.message);
}

async function repairEstimatePortalNotification(input: {
  customerId: string | null;
  shopId: string;
  workOrderId: string;
  revision: number;
}): Promise<void> {
  if (!input.customerId) return;
  const [customerResult, shopResult] = await Promise.all([
    supabaseAdmin
      .from("customers")
      .select("id,user_id")
      .eq("id", input.customerId)
      .eq("shop_id", input.shopId)
      .maybeSingle<Pick<CustomerRow, "id" | "user_id">>(),
    supabaseAdmin
      .from("shops")
      .select("name,shop_name")
      .eq("id", input.shopId)
      .maybeSingle<Pick<ShopRow, "name" | "shop_name">>(),
  ]);
  const loadError = customerResult.error ?? shopResult.error;
  if (loadError) throw new Error(loadError.message);
  if (!customerResult.data?.user_id) return;
  await upsertEstimatePortalNotification({
    userId: customerResult.data.user_id,
    customerId: customerResult.data.id,
    workOrderId: input.workOrderId,
    revision: input.revision,
    shopName:
      safeStr(shopResult.data?.shop_name).trim() ||
      safeStr(shopResult.data?.name).trim(),
  });
}

async function findAcceptedEstimateEmail(input: {
  shopId: string;
  workOrderId: string;
  revision: number;
  idempotencyKey: string;
}): Promise<Pick<EmailLogRow, "id" | "sent_at"> | null> {
  const { data, error } = await supabaseAdmin
    .from("email_logs")
    .select("id, sent_at")
    .eq("shop_id", input.shopId)
    .eq("template_key", "quote_ready")
    .contains("metadata", {
      estimate_send_key: input.idempotencyKey,
      work_order_id: input.workOrderId,
      estimate_revision: input.revision,
    })
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<EmailLogRow, "id" | "sent_at">>();

  if (error)
    throw new Error(
      `Failed to verify estimate email delivery: ${error.message}`,
    );
  return data ?? null;
}

async function recoverAcceptedEstimateSend(input: {
  event: EstimateSendEvent;
  shopId: string;
  workOrderId: string;
  revision: number;
  quoteLineIds: string[];
  sentAt: string;
  quoteUrl: string | null;
  actorProfileId: string;
  actorUserId: string;
}): Promise<void> {
  if (input.quoteLineIds.length === 0) {
    throw new Error("Estimate send reservation has no canonical quote lines.");
  }

  const { error } = await supabaseAdmin.rpc("finalize_estimate_send_atomic", {
    p_shop_id: input.shopId,
    p_work_order_id: input.workOrderId,
    p_revision: input.revision,
    p_event_id: input.event.id,
    p_sent_at: input.sentAt,
    p_quote_url: input.quoteUrl ?? "",
    p_actor_profile_id: input.actorProfileId,
    p_actor_user_id: input.actorUserId,
  });
  if (error) throw new Error(error.message);
}

function estimateSendReplayResponse(event: EstimateSendEvent, trace: string) {
  const inProgress = event.event_type === "send_reserved";
  return NextResponse.json(
    {
      ok: true,
      trace,
      deduped: true,
      inProgress,
      estimateRevision: event.revision,
    },
    { status: inProgress ? 202 : 200 },
  );
}

export async function POST(req: Request) {
  const trace = `quotes-send:${Date.now()}:${Math.random().toString(16).slice(2)}`;

  try {
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canAuthorizeQuotes",
    });
    if (!access.ok) {
      const payload = await access.response
        .json()
        .catch(() => ({ error: "Forbidden" }));
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
      .select(
        "id, customer_id, shop_id, vehicle_id, quote_url, shop_supplies_enabled_override, shop_supplies_amount_override, estimate_number, estimate_status, estimate_revision, estimate_expires_at",
      )
      .eq("id", workOrderId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle<
        Pick<
          WorkOrderRow,
          | "id"
          | "customer_id"
          | "shop_id"
          | "vehicle_id"
          | "quote_url"
          | "shop_supplies_enabled_override"
          | "shop_supplies_amount_override"
          | "estimate_number"
          | "estimate_status"
          | "estimate_revision"
          | "estimate_expires_at"
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

    let estimateSendKey: string | null = null;
    const estimatePortalQuoteUrl = wo.estimate_number
      ? portalQuoteUrlFor(workOrderId)
      : null;

    if (wo.estimate_number && !estimatePortalQuoteUrl) {
      return NextResponse.json(
        {
          ok: false,
          trace,
          error:
            "Estimate delivery requires NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_APP_URL.",
        },
        { status: 500 },
      );
    }

    if (wo.estimate_number) {
      estimateSendKey = req.headers.get("Idempotency-Key")?.trim() ?? "";
      if (!estimateSendKey || estimateSendKey.length > 200) {
        return NextResponse.json(
          {
            ok: false,
            trace,
            error:
              "A valid Idempotency-Key header is required to send an estimate.",
          },
          { status: 400 },
        );
      }

      const existingSend = await findEstimateSendEvent({
        shopId: wo.shop_id,
        workOrderId,
        revision: wo.estimate_revision,
        idempotencyKey: estimateSendKey,
      });

      if (existingSend.keyConflict) {
        return NextResponse.json(
          {
            ok: false,
            trace,
            error:
              "Idempotency key was already used for another estimate operation.",
          },
          { status: 409 },
        );
      }

      if (existingSend.event?.event_type === "send_reserved") {
        const acceptedEmail = await findAcceptedEstimateEmail({
          shopId: wo.shop_id,
          workOrderId,
          revision: wo.estimate_revision,
          idempotencyKey: existingSend.event.idempotency_key,
        });

        const reservationResult = jsonRecord(existingSend.event.result);
        const reservedAcceptedAt = safeStr(reservationResult.accepted_at);
        const acceptedAt =
          acceptedEmail?.sent_at ||
          (reservedAcceptedAt && !Number.isNaN(Date.parse(reservedAcceptedAt))
            ? reservedAcceptedAt
            : null);

        if (acceptedAt) {
          const reservationSnapshot = jsonRecord(existingSend.event.snapshot);
          const reservedActorUserId = safeStr(
            reservationSnapshot.actor_user_id,
          );
          const canUseReservedActor = Boolean(
            existingSend.event.actor_profile_id && isUuid(reservedActorUserId),
          );

          await recoverAcceptedEstimateSend({
            event: existingSend.event,
            shopId: wo.shop_id,
            workOrderId,
            revision: wo.estimate_revision,
            quoteLineIds: stringArray(reservationSnapshot.quote_line_ids),
            sentAt: acceptedAt,
            quoteUrl: estimatePortalQuoteUrl,
            actorProfileId: canUseReservedActor
              ? existingSend.event.actor_profile_id!
              : access.profile.id,
            actorUserId: canUseReservedActor
              ? reservedActorUserId
              : access.authUserId,
          });

          await repairEstimatePortalNotification({
            customerId: wo.customer_id,
            shopId: wo.shop_id,
            workOrderId,
            revision: wo.estimate_revision,
          });

          return NextResponse.json({
            ok: true,
            trace,
            deduped: true,
            recovered: true,
            estimateRevision: wo.estimate_revision,
          });
        }
      } else if (existingSend.event?.event_type === "sent") {
        await repairEstimatePortalNotification({
          customerId: wo.customer_id,
          shopId: wo.shop_id,
          workOrderId,
          revision: wo.estimate_revision,
        });
        return estimateSendReplayResponse(existingSend.event, trace);
      }
    }

    if (
      wo.estimate_number &&
      !["ready_for_advisor", "sent"].includes(
        safeStr(wo.estimate_status).toLowerCase(),
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          trace,
          error:
            "Estimate must be completed by Parts and ready for advisor review before it can be sent.",
        },
        { status: 409 },
      );
    }

    let portalUserId: string | null = null;
    let portalCustomerId: string | null = null;
    // Estimates are durable, revisioned records. Their delivery context must come
    // from the canonical shop-scoped record rather than caller-provided overrides.
    let customerEmail = wo.estimate_number
      ? ""
      : safeStr(body?.customerEmail).trim();
    let customerName = wo.estimate_number
      ? ""
      : safeStr(body?.customerName).trim();

    // Service-role client is intentionally retained after canonical shop-scoped auth
    // for privileged quote-send side effects (email/persistence/notifications).
    if (wo.customer_id) {
      const { data: customer, error: customerErr } = await supabaseAdmin
        .from("customers")
        .select("id, user_id, email, first_name, last_name, business_name")
        .eq("id", wo.customer_id)
        .eq("shop_id", wo.shop_id)
        .maybeSingle<
          Pick<
            CustomerRow,
            | "id"
            | "user_id"
            | "email"
            | "first_name"
            | "last_name"
            | "business_name"
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

    let shopName = wo.estimate_number ? "" : safeStr(body?.shopName).trim();
    let laborRate = 0;
    let brand: Awaited<ReturnType<typeof getActiveBrandForRender>> | null =
      null;
    let shopForSupplies: Pick<
      ShopRow,
      | "supplies_percent"
      | "shop_supplies_enabled"
      | "shop_supplies_type"
      | "shop_supplies_percent"
      | "shop_supplies_flat_amount"
      | "shop_supplies_cap_amount"
      | "province"
    > | null = null;

    if (wo.shop_id) {
      const { data: shop, error: shopErr } = await supabaseAdmin
        .from("shops")
        .select(
          "name, shop_name, labor_rate, supplies_percent, shop_supplies_enabled, shop_supplies_type, shop_supplies_percent, shop_supplies_flat_amount, shop_supplies_cap_amount, province",
        )
        .eq("id", wo.shop_id)
        .maybeSingle<
          Pick<
            ShopRow,
            | "name"
            | "shop_name"
            | "labor_rate"
            | "supplies_percent"
            | "shop_supplies_enabled"
            | "shop_supplies_type"
            | "shop_supplies_percent"
            | "shop_supplies_flat_amount"
            | "shop_supplies_cap_amount"
            | "province"
          >
        >();

      if (!shopErr && shop) {
        shopName =
          shopName ||
          safeStr(shop.shop_name).trim() ||
          safeStr(shop.name).trim();
        laborRate = asNumber(shop.labor_rate) ?? 0;
        shopForSupplies = shop;
      }

      brand = await getActiveBrandForRender(wo.shop_id);
    }

    let vehicleInfo: VehicleInfo | undefined = wo.estimate_number
      ? undefined
      : body?.vehicleInfo;
    if (!vehicleInfo && wo.vehicle_id) {
      const { data: v } = await supabaseAdmin
        .from("vehicles")
        .select("year, make, model")
        .eq("id", wo.vehicle_id)
        .eq("shop_id", wo.shop_id)
        .maybeSingle<Pick<VehicleRow, "year" | "make" | "model">>();

      if (v) {
        vehicleInfo = {
          year: v.year ?? null,
          make: v.make ?? null,
          model: v.model ?? null,
        };
      }
    }

    let lines: QuoteLine[] | undefined = wo.estimate_number
      ? undefined
      : body?.lines;
    let quoteTotal: number | undefined = wo.estimate_number
      ? undefined
      : body?.quoteTotal;
    let sendableQuoteLineIds: string[] = [];

    const { data: quoteLineRowsRaw, error: quoteLinesErr } = await supabaseAdmin
      .from("work_order_quote_lines")
      .select(
        "id, description, ai_complaint, notes, labor_hours, est_labor_hours, labor_total, parts_total, subtotal, tax_total, grand_total, status, stage, sent_to_customer_at, approved_at, declined_at, work_order_line_id, metadata",
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
        | "tax_total"
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

    const requestAllowsResend = req.headers.get("x-profix-resend") === "1";
    const estimateHasApprovedLines = Boolean(
      wo.estimate_number && quoteLineRows.some(isApprovedQuoteLine),
    );
    const sendableQuoteLines = quoteLineRows.filter(
      (line) =>
        isSendableQuoteLine(line) ||
        (requestAllowsResend && isResendableQuoteLine(line)),
    );

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

    const computedLineTotal = computed.reduce(
      (sum, line) => sum + line.amount,
      0,
    );
    const computedLaborPartsBase = sendableQuoteLines.reduce((sum, line) => {
      const labor = quoteLaborTotal(line, laborRate);
      const parts = quotePartsTotal(line);
      return sum + labor + parts;
    }, 0);
    const shopSupplies = calculateShopSupplies({
      baseAmount: computedLaborPartsBase,
      settings: resolveShopSuppliesSettings(
        shopForSupplies as Parameters<typeof resolveShopSuppliesSettings>[0],
      ),
      override: resolveShopSuppliesOverride(
        wo as Parameters<typeof resolveShopSuppliesOverride>[0],
      ),
    });
    const hasPersistedLineTax = sendableQuoteLines.some(
      (line) => (asNumber(line.tax_total) ?? 0) > 0,
    );
    const province = safeStr(shopForSupplies?.province).trim().toUpperCase();
    const fallbackTax =
      !hasPersistedLineTax && isProvinceCode(province)
        ? calculateTax(
            computedLineTotal + shopSuppliesTaxableSubtotal(shopSupplies),
            province,
          )
        : null;
    const fallbackTaxAmount = fallbackTax ? getTaxAmount(fallbackTax) : 0;
    const computedTotal =
      computedLineTotal + shopSupplies.amount + fallbackTaxAmount;
    const computedWithSupplies =
      shopSupplies.amount > 0
        ? [
            ...computed,
            {
              description: "Shop supplies",
              amount: shopSupplies.amount,
            } satisfies QuoteLine,
          ]
        : computed;
    const computedWithTaxes = fallbackTax
      ? [
          ...computedWithSupplies,
          ...fallbackTax.taxes.map(
            (tax) =>
              ({
                description: tax.label,
                amount: tax.amount,
              }) satisfies QuoteLine,
          ),
        ]
      : computedWithSupplies;
    sendableQuoteLineIds = sendableQuoteLines.map((line) => line.id);

    let estimateSendReservationId: string | null = null;
    if (wo.estimate_number && estimateSendKey) {
      const { data: reservationData, error: reserveError } =
        await supabaseAdmin.rpc("reserve_estimate_send_atomic", {
          p_shop_id: wo.shop_id,
          p_work_order_id: workOrderId,
          p_revision: wo.estimate_revision,
          p_idempotency_key: estimateSendKey,
          p_actor_profile_id: access.profile.id,
          p_actor_user_id: access.authUserId,
          p_quote_line_ids: sendableQuoteLineIds,
          p_allow_resend: requestAllowsResend,
        });

      if (reserveError) {
        const isConflict = ["23505", "40001", "55000"].includes(
          reserveError.code ?? "",
        );
        return NextResponse.json(
          {
            ok: false,
            trace,
            error: "Could not reserve estimate delivery.",
            detail: reserveError.message,
          },
          { status: isConflict ? 409 : 500 },
        );
      }

      const reservation = jsonRecord((reservationData ?? {}) as Json);
      if (reservation.ok === false && reservation.expired === true) {
        return NextResponse.json(
          {
            ok: false,
            trace,
            expired: true,
            error:
              safeStr(reservation.error) ||
              "This estimate has expired and cannot be sent.",
          },
          { status: 409 },
        );
      }
      const reservationEventId = safeStr(reservation.eventId);
      const reservationEventType = safeStr(reservation.eventType);
      const reservationDeliveryState = safeStr(reservation.deliveryState);
      const reservationIsReplay = reservation.replay === true;

      if (reservationIsReplay && reservationEventType === "sent") {
        await repairEstimatePortalNotification({
          customerId: wo.customer_id,
          shopId: wo.shop_id,
          workOrderId,
          revision: wo.estimate_revision,
        });
        return NextResponse.json({
          ok: true,
          trace,
          deduped: true,
          estimateRevision: wo.estimate_revision,
        });
      }
      if (reservationIsReplay) {
        if (reservationDeliveryState === "delivery_uncertain") {
          return NextResponse.json(
            {
              ok: false,
              trace,
              error:
                "The email provider outcome is uncertain. Verify delivery before retrying this estimate.",
            },
            { status: 409 },
          );
        }
        return NextResponse.json(
          {
            ok: true,
            trace,
            deduped: true,
            inProgress: true,
            estimateRevision: wo.estimate_revision,
          },
          { status: 202 },
        );
      }
      if (!isUuid(reservationEventId)) {
        return NextResponse.json(
          {
            ok: false,
            trace,
            error: "Estimate delivery reservation returned no event id.",
          },
          { status: 500 },
        );
      }
      estimateSendReservationId = reservationEventId;
    }

    if (!lines || lines.length === 0) lines = computedWithTaxes;
    if (typeof quoteTotal !== "number") quoteTotal = computedTotal;
    const pdfUrl = wo.estimate_number ? null : (body?.pdfUrl ?? null);

    const portalQuoteUrl = portalQuoteUrlFor(workOrderId);

    const quoteUrlForSend = portalQuoteUrl ?? pdfUrl ?? wo.quote_url ?? "";
    // Estimate delivery deduplication is owned by the durable revision event.
    // A pre-existing portal URL proves only that a link was generated, not that
    // the provider accepted an email for this revision.
    const shouldSkipAsDuplicate =
      !wo.estimate_number &&
      Boolean(wo.quote_url) &&
      wo.quote_url === quoteUrlForSend &&
      !requestAllowsResend;

    let acceptedEstimateSentAt: string | null = null;
    try {
      if (!shouldSkipAsDuplicate) {
        const delivery = await sendQuoteReadyEmail({
          shopId: wo.shop_id,
          to: customerEmail,
          quoteUrl: quoteUrlForSend,
          quoteTotal: quoteTotal ?? null,
          vehicleLabel: buildVehicleLabel(vehicleInfo),
          shopName: shopName || undefined,
          brandLogoUrl: brand?.logoUrl ?? null,
          brandPrimaryColor: brand?.colors.primary ?? null,
          brandSecondaryColor: brand?.colors.secondary ?? null,
          createdBy: access.profile.id,
          idempotencyKey: estimateSendKey,
          workOrderId,
          estimateRevision: wo.estimate_number ? wo.estimate_revision : null,
        });

        if (wo.estimate_number && delivery.status === "suppressed") {
          throw new QuoteDeliveryBlockedError(
            `The customer email is suppressed and cannot receive this estimate: ${delivery.reason}`,
          );
        }

        if (
          wo.estimate_number &&
          estimateSendReservationId &&
          delivery.status === "accepted"
        ) {
          acceptedEstimateSentAt = delivery.acceptedAt;
          const { error: acceptedEvidenceError } = await supabaseAdmin
            .from("estimate_events")
            .update({
              result: {
                delivery_state: "accepted",
                accepted_at: delivery.acceptedAt,
                email_log_id: delivery.emailLogId,
              },
              updated_at: delivery.acceptedAt,
            })
            .eq("id", estimateSendReservationId)
            .eq("shop_id", wo.shop_id)
            .eq("event_type", "send_reserved");
          if (acceptedEvidenceError) {
            // The email log remains the independent recovery source. Never
            // classify a provider-accepted send as retryable solely because
            // this secondary evidence update failed.
            console.error(
              "[quotes/send] failed to persist accepted estimate evidence",
              {
                trace,
                reservationId: estimateSendReservationId,
                error: acceptedEvidenceError.message,
              },
            );
          }
        }
      }
    } catch (sendError) {
      if (estimateSendReservationId) {
        const failedAt = new Date().toISOString();
        const message =
          sendError instanceof Error
            ? sendError.message
            : "Unknown quote delivery error";
        const { error: releaseError } = await supabaseAdmin
          .from("estimate_events")
          .update({
            event_type: "send_failed",
            result: {
              delivery_state: "failed",
              failed_at: failedAt,
              error: message.slice(0, 500),
            },
            updated_at: failedAt,
          })
          .eq("id", estimateSendReservationId)
          .eq("shop_id", wo.shop_id)
          .eq("event_type", "send_reserved");
        if (releaseError) {
          console.error(
            "[quotes/send] failed to release estimate send reservation",
            {
              trace,
              reservationId: estimateSendReservationId,
              error: releaseError.message,
            },
          );
        }
      }
      throw sendError;
    }

    const newQuoteUrl = portalQuoteUrl ?? pdfUrl ?? wo.quote_url ?? null;
    const sentAt = acceptedEstimateSentAt ?? new Date().toISOString();

    if (wo.estimate_number && estimateSendReservationId) {
      const { error: finalizeError } = await supabaseAdmin.rpc(
        "finalize_estimate_send_atomic",
        {
          p_shop_id: wo.shop_id,
          p_work_order_id: workOrderId,
          p_revision: wo.estimate_revision,
          p_event_id: estimateSendReservationId,
          p_sent_at: sentAt,
          p_quote_url: estimatePortalQuoteUrl ?? "",
          p_actor_profile_id: access.profile.id,
          p_actor_user_id: access.authUserId,
        },
      );

      if (finalizeError) {
        return NextResponse.json(
          {
            ok: true,
            trace,
            deduped: false,
            inProgress: true,
            sentWithWarnings: true,
            warnings: [
              {
                step: "estimate_send_finalize",
                error: finalizeError.message,
              },
            ],
          },
          { status: 202 },
        );
      }
    }

    const postSendWarnings = await runPostSendPersistence([
      ...(!wo.estimate_number && newQuoteUrl !== wo.quote_url
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
      ...(!wo.estimate_number && sendableQuoteLineIds.length > 0
        ? [
            {
              step: "work_order_quote_lines_mark_sent",
              run: async () => {
                const { error } = await supabaseAdmin
                  .from("work_order_quote_lines")
                  .update({
                    status: "sent",
                    stage: "sent",
                    sent_to_customer_at: sentAt,
                    sent_at: sentAt,
                    sent_by: access.authUserId,
                    updated_at: sentAt,
                  })
                  .eq("shop_id", wo.shop_id)
                  .eq("work_order_id", workOrderId)
                  .in("id", sendableQuoteLineIds);
                if (error) throw new Error(error.message);
              },
            },
            {
              step: "work_order_quote_approval_state_update",
              run: async () => {
                const update: WorkOrderUpdate = {
                  approval_state: estimateHasApprovedLines
                    ? "partial"
                    : "pending",
                  updated_at: sentAt,
                };
                const { error } = await supabaseAdmin
                  .from("work_orders")
                  .update(update)
                  .eq("id", workOrderId)
                  .eq("shop_id", wo.shop_id);
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
                if (wo.estimate_number) {
                  await upsertEstimatePortalNotification({
                    userId: portalUserId,
                    customerId: portalCustomerId,
                    workOrderId,
                    revision: wo.estimate_revision,
                    shopName,
                  });
                  return;
                }
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
      return NextResponse.json(
        {
          ok: true,
          trace,
          deduped: shouldSkipAsDuplicate,
          inProgress: false,
          sentWithWarnings: true,
          warnings: postSendWarnings,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok: true,
      trace,
      deduped: shouldSkipAsDuplicate,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error sending quote";
    console.error("[quotes/send] Quote Send Failed:", trace, message);
    return NextResponse.json(
      {
        ok: false,
        trace,
        error:
          err instanceof QuoteDeliveryBlockedError
            ? err.message
            : "Quote send failed",
        detail: message,
      },
      { status: err instanceof QuoteDeliveryBlockedError ? err.status : 500 },
    );
  }
}
