import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { closeWorkOrderCorrection } from "@/features/work-orders/server/financialCorrectionLifecycle";

type DB = Database;
const ALLOWED_ROLES = ["owner", "admin", "manager"] as const;

type Body = {
  metadata?: Json;
};

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; sessionId: string }> },
) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: [...ALLOWED_ROLES],
  });
  if (!access.ok) return access.response;

  const { id, sessionId } = await context.params;
  const workOrderId = id.trim();
  const correctionSessionId = sessionId.trim();
  const body = (await req.json().catch(() => null)) as Body | null;

  if (!workOrderId || !correctionSessionId) {
    return NextResponse.json(
      { error: "Missing work order or correction session id" },
      { status: 400 },
    );
  }

  try {
    const admin = createClient<DB>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const session = await closeWorkOrderCorrection({
      supabase: admin,
      shopId: access.profile.shop_id,
      workOrderId,
      correctionSessionId,
      actorUserId: access.profile.id,
      ...(body?.metadata !== undefined ? { metadata: body.metadata } : {}),
    });

    return NextResponse.json({ ok: true, session });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to close correction session";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
