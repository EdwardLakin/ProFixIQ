import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type Body = {
  partId?: string | null;
  quantity?: number | string | null;
  unitCost?: number | string | null;
  operationKey?: string | null;
};

type ReviewResult = {
  ok?: boolean;
  menu_item_id?: string;
  part_request_id?: string;
  part_request_item_id?: string;
  request_complete?: boolean;
  remaining_items?: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return UUID_PATTERN.test(cleaned) ? cleaned : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageParts",
  });
  if (!access.ok) return access.response;

  const { itemId: rawItemId } = await context.params;
  const itemId = cleanUuid(rawItemId);
  const body = (await request.json().catch(() => null)) as Body | null;
  const partId = cleanUuid(body?.partId);
  const operationKey = cleanUuid(body?.operationKey);
  const quantity = finiteNumber(body?.quantity);
  const unitCost = finiteNumber(body?.unitCost);

  if (!itemId || !partId || !operationKey) {
    return NextResponse.json(
      { ok: false, error: "A valid intake item, catalog part, and operation key are required." },
      { status: 400 },
    );
  }
  if (quantity === null || quantity <= 0 || quantity > 10_000) {
    return NextResponse.json(
      { ok: false, error: "Quantity must be greater than zero." },
      { status: 400 },
    );
  }
  if (unitCost === null || unitCost < 0 || unitCost > 10_000_000) {
    return NextResponse.json(
      { ok: false, error: "Unit cost must be zero or greater." },
      { status: 400 },
    );
  }

  const rpc = access.supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: ReviewResult | null;
    error: { message: string } | null;
  }>;
  const { data, error } = await rpc("review_menu_item_part_intake", {
    p_shop_id: access.profile.shop_id,
    p_actor_profile_id: access.profile.id,
    p_actor_auth_user_id: access.authUserId,
    p_request_item_id: itemId,
    p_catalog_part_id: partId,
    p_quantity: quantity,
    p_unit_cost: unitCost,
    p_operation_key: operationKey,
  });

  if (error || !data?.ok) {
    const detail = error?.message ?? "The menu part could not be reviewed.";
    const status = /not authorized|identity|member|available to this shop/i.test(
      detail,
    )
      ? 403
      : /not found/i.test(detail)
        ? 404
        : /not an active service-menu intake/i.test(detail)
          ? 409
          : /required|quantity|unit cost/i.test(detail)
            ? 400
            : 500;
    return NextResponse.json(
      { ok: false, error: detail },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    menuItemId: data.menu_item_id,
    requestId: data.part_request_id,
    itemId: data.part_request_item_id,
    complete: Boolean(data.request_complete),
    remainingItems: Number(data.remaining_items ?? 0),
  });
}
