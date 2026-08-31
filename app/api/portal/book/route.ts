import { NextResponse } from "next/server";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  createPortalBooking,
  type CreatePortalBookingInput,
} from "@/features/portal/server/createPortalBooking";

export const runtime = "nodejs";

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

function legacyStaffOperationKey(
  userId: string,
  body: CreatePortalBookingInput,
): string {
  return [
    "legacy-staff-booking",
    userId,
    body.shopSlug,
    body.customerId ?? "customer",
    body.vehicleId ?? "vehicle",
    body.startsAt,
    body.endsAt,
  ]
    .join(":")
    .slice(0, 300);
}

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      allowRoles: ROLE_GROUPS.schedulerBookingWriters,
      requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
    });
    if (!access.ok) return access.response;

    const { authUserId: userId, supabase } = access;

    const body = (await req
      .json()
      .catch(() => null)) as CreatePortalBookingInput | null;
    if (!body) return bad("Invalid JSON body", 400);

    const operationKey =
      req.headers.get("Idempotency-Key")?.trim() ||
      body.operationKey?.trim() ||
      body.idempotencyKey?.trim() ||
      legacyStaffOperationKey(userId, body);

    const result = await createPortalBooking({
      supabase,
      userId,
      input: { ...body, operationKey },
      actorMode: "allow-staff",
    });

    if (!result.ok) return bad(result.error, result.status);
    return NextResponse.json({ booking: result.booking }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Booking error:", message);
    return bad("Unexpected error", 500);
  }
}
