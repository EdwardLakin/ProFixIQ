import { NextResponse } from "next/server";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
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
  shopId: string,
  body: CreatePortalBookingInput,
): string {
  // Preserve the exact pre-#1627 slug component when one was supplied. Durable
  // booking receipts are keyed by this exact string, so normalizing an existing
  // slug here would break retries that cross the deployment boundary. Null-slug
  // staff callers use the authenticated canonical shop id instead.
  const legacyShopKey = body.shopSlug || shopId;
  return [
    "legacy-staff-booking",
    userId,
    legacyShopKey,
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
    });
    if (!access.ok) return access.response;

    const { authUserId: userId, supabase } = access;

    const body = (await req.json().catch(() => null)) as CreatePortalBookingInput | null;
    if (!body) return bad("Invalid JSON body", 400);

    const operationKey =
      req.headers.get("Idempotency-Key")?.trim() ||
      body.operationKey?.trim() ||
      body.idempotencyKey?.trim() ||
      legacyStaffOperationKey(userId, access.profile.shop_id, body);

    const result = await createPortalBooking({
      supabase,
      userId,
      input: { ...body, operationKey },
      actorMode: "allow-staff",
      staffShopId: access.profile.shop_id,
    });

    if (!result.ok) return bad(result.error, result.status);
    return NextResponse.json({ booking: result.booking }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Booking error:", message);
    return bad("Unexpected error", 500);
  }
}
