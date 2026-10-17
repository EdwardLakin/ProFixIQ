import { NextResponse } from "next/server";

import { readVapidConfig } from "@/features/notifications/server/webPush";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public VAPID key for subscribing; `supported:false` when push is unconfigured. */
export async function GET() {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const config = readVapidConfig();
  return NextResponse.json(
    { supported: Boolean(config), publicKey: config?.publicKey ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
