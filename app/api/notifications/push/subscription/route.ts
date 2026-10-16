import { NextResponse } from "next/server";

import {
  hashPushEndpoint,
  parsePushSubscriptionInput,
} from "@/features/notifications/lib/pushContracts";
import { createNotificationAdmin } from "@/features/notifications/server/db";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registers (or re-registers) this device for the signed-in user. An endpoint
 * belongs to one user at a time: a different account signing in on the same
 * device takes it over, so the previous account stops receiving pushes there.
 */
export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const parsed = parsePushSubscriptionInput(await request.json().catch(() => null));
  if (!parsed) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  const admin = createNotificationAdmin();
  const { error } = await admin.from("app_push_subscriptions").upsert(
    {
      shop_id: access.profile.shop_id,
      user_id: access.profile.id,
      endpoint: parsed.endpoint,
      endpoint_hash: hashPushEndpoint(parsed.endpoint),
      p256dh: parsed.p256dh,
      auth_secret: parsed.authSecret,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      expires_at: parsed.expiresAt,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
      revoked_reason: null,
      consecutive_failures: 0,
    },
    { onConflict: "endpoint_hash" },
  );
  if (error) {
    return NextResponse.json({ error: "Could not save subscription." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Revokes only the caller's own subscription for this endpoint. */
export async function DELETE(request: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string" || body.endpoint.length > 2000) {
    return NextResponse.json({ error: "endpoint is required." }, { status: 400 });
  }

  const admin = createNotificationAdmin();
  const { error } = await admin
    .from("app_push_subscriptions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: "user_disabled" })
    .eq("endpoint_hash", hashPushEndpoint(body.endpoint))
    .eq("user_id", access.profile.id)
    .eq("shop_id", access.profile.shop_id)
    .is("revoked_at", null);
  if (error) {
    return NextResponse.json({ error: "Could not remove subscription." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
