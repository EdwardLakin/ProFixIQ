import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value == null || value === "") return null;
  return boundedText(value, maxLength);
}

function optionalDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return value;
}

function moneyOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  if (
    !Number.isFinite(numberValue) ||
    numberValue < 0 ||
    Math.round(numberValue * 100) / 100 !== numberValue
  ) {
    return null;
  }
  return numberValue;
}

function percent(value: unknown): number | null {
  const numberValue = moneyOrNull(value ?? 0);
  return numberValue != null && numberValue <= 100 ? numberValue : null;
}

function errorMessage(error: {
  message: string;
  details?: string | null;
  hint?: string | null;
}): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

function statusForError(message: string): number {
  if (message.includes("not found")) return 404;
  if (message.includes("ROLE_REQUIRED") || message.includes("access denied")) {
    return 403;
  }
  if (message.includes("CONFLICT") || message.includes("linked active Fleet")) {
    return 409;
  }
  return 400;
}

async function customerId(context: RouteContext): Promise<string | null> {
  const { id } = await context.params;
  return UUID_PATTERN.test(id.trim()) ? id.trim() : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canAuthorizeQuotes",
  });
  if (!access.ok) return access.response;

  const id = await customerId(context);
  if (!id) {
    return NextResponse.json(
      { error: "Invalid customer id." },
      { status: 400 },
    );
  }

  const { data, error } = await access.supabase.rpc(
    "get_customer_pricing_account_summary" as never,
    {
      p_shop_id: access.profile.shop_id,
      p_customer_id: id,
      p_at: new Date().toISOString(),
    } as never,
  );

  if (error) {
    const message = errorMessage(error);
    return NextResponse.json(
      { ok: false, error: message },
      { status: statusForError(message) },
    );
  }

  return NextResponse.json(
    data && typeof data === "object" ? data : { ok: true, agreements: [] },
  );
}

export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canEditPricing",
    allowRoles: ["owner", "admin", "manager"],
  });
  if (!access.ok) return access.response;

  const id = await customerId(context);
  if (!id) {
    return NextResponse.json(
      { error: "Invalid customer id." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const sourceType = boundedText(body?.sourceType, 40);
  const name = boundedText(body?.name, 120);
  const currency = boundedText(body?.currency, 3)?.toUpperCase() ?? "CAD";
  const laborRate = moneyOrNull(body?.laborRate);
  const laborDiscountPercent = percent(body?.laborDiscountPercent);
  const partsDiscountPercent = percent(body?.partsDiscountPercent);
  const effectiveFrom = optionalDate(body?.effectiveFrom);
  const effectiveUntil = optionalDate(body?.effectiveUntil);
  const approvalReason = boundedText(body?.approvalReason, 500);
  const notes = optionalText(body?.notes, 2000);
  const operationKey = boundedText(
    body?.operationKey ?? request.headers.get("idempotency-key"),
    200,
  );

  if (
    !sourceType ||
    !["customer_specific", "customer_contract", "fleet_contract"].includes(
      sourceType,
    ) ||
    !name ||
    !["CAD", "USD"].includes(currency) ||
    laborDiscountPercent == null ||
    partsDiscountPercent == null ||
    !effectiveFrom ||
    (body?.effectiveUntil && !effectiveUntil) ||
    !approvalReason ||
    !operationKey
  ) {
    return NextResponse.json(
      {
        error: "Customer pricing agreement details are incomplete or invalid.",
      },
      { status: 400 },
    );
  }
  if (body?.laborRate != null && body.laborRate !== "" && laborRate == null) {
    return NextResponse.json(
      { error: "Labor rate must be a non-negative amount with two decimals." },
      { status: 400 },
    );
  }
  if (laborRate != null && laborDiscountPercent > 0) {
    return NextResponse.json(
      { error: "Choose a fixed labor rate or a labor discount, not both." },
      { status: 400 },
    );
  }
  if (
    laborRate == null &&
    laborDiscountPercent === 0 &&
    partsDiscountPercent === 0
  ) {
    return NextResponse.json(
      { error: "At least one customer pricing adjustment is required." },
      { status: 400 },
    );
  }

  const { data, error } = await access.supabase.rpc(
    "create_customer_pricing_agreement_atomic" as never,
    {
      p_shop_id: access.profile.shop_id,
      p_customer_id: id,
      p_source_type: sourceType,
      p_name: name,
      p_currency: currency,
      p_labor_rate: laborRate,
      p_labor_discount_percent: laborDiscountPercent,
      p_parts_discount_percent: partsDiscountPercent,
      p_effective_from: effectiveFrom,
      p_effective_until: effectiveUntil,
      p_approval_reason: approvalReason,
      p_notes: notes,
      p_operation_key: operationKey,
      p_actor_user_id: access.authUserId,
      p_at: new Date().toISOString(),
    } as never,
  );

  if (error) {
    const message = errorMessage(error);
    return NextResponse.json(
      { ok: false, error: message },
      { status: statusForError(message) },
    );
  }

  return NextResponse.json(
    data && typeof data === "object" ? data : { ok: true },
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canEditPricing",
    allowRoles: ["owner", "admin", "manager"],
  });
  if (!access.ok) return access.response;

  const id = await customerId(context);
  if (!id) {
    return NextResponse.json(
      { error: "Invalid customer id." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const agreementId = boundedText(body?.agreementId, 50);
  const reason = boundedText(body?.reason, 500);
  if (!agreementId || !UUID_PATTERN.test(agreementId) || !reason) {
    return NextResponse.json(
      { error: "Agreement id and retirement reason are required." },
      { status: 400 },
    );
  }

  const { data, error } = await access.supabase.rpc(
    "retire_customer_pricing_agreement_atomic" as never,
    {
      p_shop_id: access.profile.shop_id,
      p_agreement_id: agreementId,
      p_actor_user_id: access.authUserId,
      p_reason: reason,
      p_at: new Date().toISOString(),
    } as never,
  );

  if (error) {
    const message = errorMessage(error);
    return NextResponse.json(
      { ok: false, error: message },
      { status: statusForError(message) },
    );
  }

  return NextResponse.json(
    data && typeof data === "object" ? data : { ok: true },
  );
}
