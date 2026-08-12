import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_TERMS = new Set([
  "due_on_receipt",
  "net_7",
  "net_15",
  "net_30",
  "net_45",
  "net_60",
  "custom",
]);
const ACCOUNT_STATUSES = new Set([
  "good_standing",
  "credit_hold",
  "account_hold",
]);

function optionalText(value: unknown, maxLength: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function requiredText(value: unknown, maxLength: number): string | null {
  return optionalText(value, maxLength);
}

function uuid(value: unknown): string | null {
  const candidate = optionalText(value, 50);
  return candidate && UUID_PATTERN.test(candidate) ? candidate : null;
}

function errorMessage(error: {
  message: string;
  details?: string | null;
  hint?: string | null;
}): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

function statusFor(message: string): number {
  if (/not found/i.test(message)) return 404;
  if (/ROLE_REQUIRED|ACTOR_MISMATCH|access denied/i.test(message)) return 403;
  if (/conflict|Fleet workspace|portal identities/i.test(message)) return 409;
  return 400;
}

async function routeCustomerId(context: RouteContext): Promise<string | null> {
  const { id } = await context.params;
  return uuid(id);
}

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;
  const customerId = await routeCustomerId(context);
  if (!customerId) {
    return NextResponse.json(
      { error: "Invalid customer id." },
      { status: 400 },
    );
  }

  const { data, error } = await access.supabase.rpc(
    "get_customer_account_center" as never,
    {
      p_shop_id: access.profile.shop_id,
      p_customer_id: customerId,
      p_actor_user_id: access.authUserId,
    } as never,
  );
  if (error) {
    const message = errorMessage(error);
    return NextResponse.json(
      { error: message },
      { status: statusFor(message) },
    );
  }
  return NextResponse.json(data ?? { ok: true });
}

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;
  const customerId = await routeCustomerId(context);
  if (!customerId) {
    return NextResponse.json(
      { error: "Invalid customer id." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const action = optionalText(body?.action, 40);
  const operationKey =
    requiredText(body?.operationKey, 200) ??
    requiredText(request.headers.get("idempotency-key"), 200);
  if (!action || !operationKey) {
    return NextResponse.json(
      { error: "Account action and operation key are required." },
      { status: 400 },
    );
  }

  let rpcName = "";
  let rpcArgs: Record<string, unknown> = {};

  if (action === "update_commercial_controls") {
    const paymentTerms = optionalText(body?.paymentTerms, 40)?.toLowerCase();
    const accountStatus = optionalText(body?.accountStatus, 40)?.toLowerCase();
    const paymentTermsDays = Number(body?.paymentTermsDays ?? 0);
    if (
      !paymentTerms ||
      !PAYMENT_TERMS.has(paymentTerms) ||
      !accountStatus ||
      !ACCOUNT_STATUSES.has(accountStatus) ||
      !Number.isInteger(paymentTermsDays) ||
      paymentTermsDays < 0 ||
      paymentTermsDays > 365
    ) {
      return NextResponse.json(
        { error: "Commercial controls are incomplete or invalid." },
        { status: 400 },
      );
    }
    rpcName = "update_customer_commercial_controls_atomic";
    rpcArgs = {
      p_shop_id: access.profile.shop_id,
      p_customer_id: customerId,
      p_primary_billing_contact_id: uuid(body?.primaryBillingContactId),
      p_primary_approval_contact_id: uuid(body?.primaryApprovalContactId),
      p_po_required: body?.poRequired === true,
      p_payment_terms: paymentTerms,
      p_payment_terms_days: paymentTermsDays,
      p_tax_exempt: body?.taxExempt === true,
      p_tax_exemption_reference: optionalText(body?.taxExemptionReference, 300),
      p_account_status: accountStatus,
      p_account_hold_reason: optionalText(body?.accountHoldReason, 500),
      p_billing_notes: optionalText(body?.billingNotes, 4000),
      p_customer_reference: optionalText(body?.customerReference, 500),
      p_actor_user_id: access.authUserId,
      p_operation_key: operationKey,
    };
  } else if (action === "archive") {
    const reason = requiredText(body?.reason, 500);
    if (!reason || reason.length < 3) {
      return NextResponse.json(
        { error: "Archive reason is required." },
        { status: 400 },
      );
    }
    rpcName = "archive_customer_account_atomic";
    rpcArgs = {
      p_shop_id: access.profile.shop_id,
      p_customer_id: customerId,
      p_reason: reason,
      p_actor_user_id: access.authUserId,
      p_operation_key: operationKey,
    };
  } else if (action === "merge") {
    const targetCustomerId = uuid(body?.targetCustomerId);
    const reason = requiredText(body?.reason, 500);
    if (!targetCustomerId || !reason || reason.length < 3) {
      return NextResponse.json(
        { error: "Target customer and merge reason are required." },
        { status: 400 },
      );
    }
    rpcName = "merge_customer_accounts_atomic";
    rpcArgs = {
      p_shop_id: access.profile.shop_id,
      p_source_customer_id: customerId,
      p_target_customer_id: targetCustomerId,
      p_reason: reason,
      p_actor_user_id: access.authUserId,
      p_operation_key: operationKey,
    };
  } else {
    return NextResponse.json(
      { error: "Unsupported account action." },
      { status: 400 },
    );
  }

  const { data, error } = await access.supabase.rpc(
    rpcName as never,
    rpcArgs as never,
  );
  if (error) {
    const message = errorMessage(error);
    return NextResponse.json(
      { error: message },
      { status: statusFor(message) },
    );
  }
  return NextResponse.json(data ?? { ok: true });
}
