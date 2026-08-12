import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DuplicateCandidate = {
  id: string;
  display_name: string;
  account_type: string;
  email: string | null;
  phone: string | null;
  reasons: string[];
  score: number;
};

type CreateResult = {
  ok: boolean;
  code?: string;
  matched_existing?: boolean;
  customer?: { id: string };
  duplicate_candidates?: DuplicateCandidate[];
};

const ACCOUNT_TYPES = new Set([
  "individual",
  "business",
  "fleet",
  "enterprise",
]);

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value == null || value === "") return null;
  return text(value, maxLength);
}

function message(error: {
  message: string;
  details?: string | null;
  hint?: string | null;
}): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const params = new URL(request.url).searchParams;
  const { data, error } = await access.supabase.rpc(
    "find_customer_account_duplicates" as never,
    {
      p_shop_id: access.profile.shop_id,
      p_name: optionalText(params.get("name"), 200),
      p_business_name: optionalText(params.get("businessName"), 200),
      p_email: optionalText(params.get("email"), 320),
      p_phone: optionalText(params.get("phone"), 50),
      p_vin: optionalText(params.get("vin"), 40),
      p_exclude_customer_id: optionalText(params.get("excludeCustomerId"), 50),
      p_actor_user_id: access.authUserId,
    } as never,
  );

  if (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    duplicateCandidates: Array.isArray(data) ? data : [],
  });
}

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const accountType = text(body?.accountType, 20)?.toLowerCase() ?? "";
  const name = optionalText(body?.name, 200);
  const businessName = optionalText(body?.businessName, 200);
  const operationKey =
    text(body?.operationKey, 200) ??
    text(request.headers.get("idempotency-key"), 200);

  if (
    !ACCOUNT_TYPES.has(accountType) ||
    (!name && !businessName) ||
    !operationKey
  ) {
    return NextResponse.json(
      { error: "Customer type, name, and operation key are required." },
      { status: 400 },
    );
  }

  const { data, error } = await access.supabase.rpc(
    "create_customer_account_atomic" as never,
    {
      p_shop_id: access.profile.shop_id,
      p_account_type: accountType,
      p_name: name,
      p_business_name: businessName,
      p_email: optionalText(body?.email, 320),
      p_phone: optionalText(body?.phone, 50),
      p_address: optionalText(body?.address, 500),
      p_city: optionalText(body?.city, 120),
      p_province: optionalText(body?.province, 120),
      p_postal_code: optionalText(body?.postalCode, 30),
      p_notes: optionalText(body?.notes, 4000),
      p_vin: optionalText(body?.vin, 40),
      p_match_existing: body?.matchExisting === true,
      p_allow_duplicate: body?.allowDuplicate === true,
      p_actor_user_id: access.authUserId,
      p_operation_key: operationKey,
    } as never,
  );

  if (error) {
    const errorMessage = message(error);
    return NextResponse.json(
      { error: errorMessage },
      { status: errorMessage.includes("ROLE_REQUIRED") ? 403 : 400 },
    );
  }

  const result = (data ?? { ok: false }) as CreateResult;
  if (!result.ok && result.code === "CUSTOMER_DUPLICATE_REVIEW_REQUIRED") {
    return NextResponse.json(result, { status: 409 });
  }
  if (!result.ok || !result.customer?.id) {
    return NextResponse.json(
      { error: "Customer account could not be resolved." },
      { status: 400 },
    );
  }

  return NextResponse.json(result, {
    status: result.matched_existing ? 200 : 201,
  });
}
