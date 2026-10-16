import { NextResponse } from "next/server";

import { createNotificationAdmin } from "@/features/notifications/server/db";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Records that the recipient acknowledged the notification. This is a user
 * action, independent of push delivery status. Idempotent: repeats keep the
 * first acknowledgement time.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const { id } = await context.params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Invalid notification id." }, { status: 400 });
  }

  const admin = createNotificationAdmin();
  const scope = { shop: access.profile.shop_id, user: access.profile.id };
  const now = new Date().toISOString();

  const { data: existing, error: readError } = await admin
    .from("app_notifications")
    .select("id, acknowledged_at")
    .eq("id", id)
    .eq("shop_id", scope.shop)
    .eq("recipient_user_id", scope.user)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ error: "Could not acknowledge." }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.acknowledged_at) {
    return NextResponse.json({ ok: true, acknowledgedAt: existing.acknowledged_at, idempotent: true });
  }

  const { error } = await admin
    .from("app_notifications")
    .update({ acknowledged_at: now, read_at: now })
    .eq("id", id)
    .eq("shop_id", scope.shop)
    .eq("recipient_user_id", scope.user)
    .is("acknowledged_at", null);
  if (error) {
    return NextResponse.json({ error: "Could not acknowledge." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, acknowledgedAt: now, idempotent: false });
}
