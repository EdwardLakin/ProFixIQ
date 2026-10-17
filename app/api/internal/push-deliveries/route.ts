import { NextResponse } from "next/server";

import { createNotificationAdmin } from "@/features/notifications/server/db";
import { processPushDeliveries } from "@/features/notifications/server/pushDelivery";
import { createWebPushSender } from "@/features/notifications/server/webPush";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = requireInternalApiSecret({
    request,
    envSecretName: "INTERNAL_CRON_SECRET",
    headerName: "x-internal-cron-secret",
    routeLabel: "internal/push-deliveries",
    bearerEnvSecretName: "CRON_SECRET",
  });
  if (!gate.ok) return gate.response;

  const send = createWebPushSender();
  if (!send) {
    return NextResponse.json({ ok: true, skipped: "vapid_not_configured" });
  }
  try {
    const summary = await processPushDeliveries({ admin: createNotificationAdmin(), send });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[internal/push-deliveries] failed", error);
    return NextResponse.json({ ok: false, error: "Push delivery run failed." }, { status: 500 });
  }
}
