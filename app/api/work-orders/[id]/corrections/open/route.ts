import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  openWorkOrderCorrection,
  type WorkOrderCorrectionScope,
} from "@/features/work-orders/server/financialCorrectionLifecycle";

type DB = Database;
const ALLOWED_ROLES = ["owner", "admin", "manager"] as const;
const ALLOWED_SCOPES = new Set<WorkOrderCorrectionScope>([
  "operational_correction",
  "invoice_adjustment",
  "void_and_reissue",
  "data_repair",
]);

type Body = {
  reason?: string;
  scope?: WorkOrderCorrectionScope;
  idempotencyKey?: string;
  metadata?: Json;
};

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: [...ALLOWED_ROLES],
  });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const workOrderId = id.trim();
  const body = (await req.json().catch(() => null)) as Body | null;
  const reason = body?.reason?.trim() ?? "";
  const scope = body?.scope ?? "operational_correction";
  const idempotencyKey =
    body?.idempotencyKey?.trim() || req.headers.get("idempotency-key")?.trim() || "";

  if (!workOrderId) {
    return NextResponse.json({ error: "Missing work order id" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "A correction reason is required" }, { status: 400 });
  }
  if (!ALLOWED_SCOPES.has(scope)) {
    return NextResponse.json({ error: "Unsupported correction scope" }, { status: 400 });
  }
  if (!idempotencyKey) {
    return NextResponse.json({ error: "An idempotency key is required" }, { status: 400 });
  }

  try {
    const admin = createClient<DB>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const session = await openWorkOrderCorrection({
      supabase: admin,
      shopId: access.profile.shop_id,
      workOrderId,
      actorUserId: access.profile.id,
      reason,
      scope,
      operationKey: `correction:${access.profile.shop_id}:${idempotencyKey}`,
      ...(body?.metadata !== undefined ? { metadata: body.metadata } : {}),
    });
    return NextResponse.json({ ok: true, session });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to open correction session";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
