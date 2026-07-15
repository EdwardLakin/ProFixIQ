export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type SuggestedItem = {
  description?: string | null;
  serviceCode?: string | null;
  jobType?: string | null;
  laborHours?: number | null;
  notes?: string | null;
  aiComplaint?: string | null;
  aiCause?: string | null;
  aiCorrection?: string | null;
};

type Body = {
  workOrderId?: string | null;
  vehicleId?: string | null;
  odometerKm?: number | null;
  items?: SuggestedItem[] | null;
  operationKey?: string | null;
  idempotencyKey?: string | null;
};

type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stableOperationKey(input: {
  actorId: string;
  workOrderId: string;
  items: SuggestedItem[];
}): string {
  const normalized = input.items.map((item) => ({
    description: clean(item.description),
    serviceCode: clean(item.serviceCode),
    jobType: clean(item.jobType),
    laborHours:
      typeof item.laborHours === "number" && Number.isFinite(item.laborHours)
        ? item.laborHours
        : null,
    notes: clean(item.notes),
    aiComplaint: clean(item.aiComplaint),
    aiCause: clean(item.aiCause),
    aiCorrection: clean(item.aiCorrection),
  }));

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        actorId: input.actorId,
        workOrderId: input.workOrderId,
        items: normalized,
      }),
    )
    .digest("hex");
}

function errorStatus(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("not found")) return 404;
  if (lower.includes("not authorized")) return 403;
  if (lower.includes("financially_locked")) return 409;
  return 400;
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const workOrderId = clean(body?.workOrderId);
  const items = Array.isArray(body?.items) ? body.items : [];

  if (!workOrderId) {
    return NextResponse.json({ error: "Missing workOrderId" }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  const suppliedKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    clean(body?.operationKey) ||
    clean(body?.idempotencyKey);
  const operationKey =
    suppliedKey ||
    stableOperationKey({
      actorId: access.profile.id,
      workOrderId,
      items,
    });

  const rpc = access.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc(
    "add_ai_suggested_quote_lines_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_work_order_id: workOrderId,
      p_actor_user_id: access.profile.id,
      p_items: items,
      p_operation_key: `${access.profile.shop_id}:ai-suggested-quotes:${operationKey}`,
      p_at: new Date().toISOString(),
    },
  );

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    return NextResponse.json(
      { error: message },
      { status: errorStatus(message) },
    );
  }

  return NextResponse.json(
    data && typeof data === "object" ? data : { ok: true },
  );
}
