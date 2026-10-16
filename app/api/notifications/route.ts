import { NextResponse } from "next/server";

import { createNotificationAdmin } from "@/features/notifications/server/db";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's own notifications, newest first. */
export async function GET() {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const admin = createNotificationAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("app_notifications")
    .select("id, event_type, title, body, target_path, priority, created_at, read_at, acknowledged_at")
    .eq("shop_id", access.profile.shop_id)
    .eq("recipient_user_id", access.profile.id)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: "Could not load notifications." }, { status: 500 });
  }
  return NextResponse.json(
    { notifications: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
