import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const COLLECTED_BY_TYPES = new Set([
  "customer",
  "authorized_representative",
  "fleet_driver",
]);

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

type RpcError = { message: string };
type PickupRpcResult = {
  ok?: boolean;
  idempotent?: boolean;
  picked_up?: boolean;
  work_order_id?: string;
  customer_id?: string | null;
  picked_up_at?: string;
  picked_up_by_user_id?: string;
};

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>;
};

type Body = {
  collectedByType?: string;
  collectedByName?: string | null;
  notes?: string | null;
  overrideUnpaid?: boolean;
  releaseReason?: string | null;
  pickedUpAt?: string | null;
};

function pickupErrorResponse(message: string): NextResponse {
  const normalized = message.toUpperCase();
  if (normalized.includes("WORK_ORDER_NOT_FOUND")) {
    return NextResponse.json(
      { ok: false, error: "Work order not found for this shop." },
      { status: 404 },
    );
  }
  if (normalized.includes("PICKUP_FORBIDDEN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (normalized.includes("PICKUP_WORK_ORDER_ARCHIVED")) {
    return NextResponse.json(
      {
        ok: false,
        error: "This work order is archived and cannot be marked picked up.",
      },
      { status: 409 },
    );
  }
  if (normalized.includes("PICKUP_NOT_READY")) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This work order is not ready for vehicle handover yet. Repairs and invoicing must be complete first.",
      },
      { status: 409 },
    );
  }
  if (normalized.includes("PICKUP_UNPAID_BALANCE_REQUIRES_OVERRIDE")) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This invoice has an outstanding balance. Confirm an authorized unpaid release with a reason to continue.",
        requiresUnpaidOverride: true,
      },
      { status: 409 },
    );
  }
  if (normalized.includes("PICKUP_RELEASE_REASON_REQUIRED")) {
    return NextResponse.json(
      { ok: false, error: "A reason is required to release an unpaid vehicle." },
      { status: 400 },
    );
  }
  if (normalized.includes("PICKUP_INVALID_COLLECTED_BY")) {
    return NextResponse.json(
      { ok: false, error: "Select who is collecting the vehicle." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: false, error: message }, { status: 409 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { ok: false, error: "Invalid work order id." },
      { status: 400 },
    );
  }

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as Body | null;
  const collectedByType = String(body?.collectedByType ?? "").trim();
  if (!COLLECTED_BY_TYPES.has(collectedByType)) {
    return NextResponse.json(
      { ok: false, error: "Select who is collecting the vehicle." },
      { status: 400 },
    );
  }

  const pickedUpAt = body?.pickedUpAt ? new Date(body.pickedUpAt) : null;
  const rpcClient = access.supabase as unknown as RpcClient;
  const { data, error } = await rpcClient.rpc("mark_work_order_picked_up_atomic", {
    p_shop_id: access.profile.shop_id,
    p_work_order_id: id,
    p_actor_user_id: access.authUserId,
    p_collected_by_type: collectedByType,
    p_collected_by_name: body?.collectedByName?.trim() || null,
    p_notes: body?.notes?.trim() || null,
    p_override_unpaid: Boolean(body?.overrideUnpaid),
    p_release_reason: body?.releaseReason?.trim() || null,
    ...(pickedUpAt && !Number.isNaN(pickedUpAt.getTime())
      ? { p_at: pickedUpAt.toISOString() }
      : {}),
  });

  if (error) return pickupErrorResponse(error.message);

  const result = (data ?? {}) as PickupRpcResult;
  if (!result.ok || !result.picked_up || !result.work_order_id) {
    return NextResponse.json(
      { ok: false, error: "Pickup confirmation returned an invalid result." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    idempotent: Boolean(result.idempotent),
    workOrderId: result.work_order_id,
    customerId: result.customer_id ?? null,
    pickedUpAt: result.picked_up_at ?? null,
    pickedUp: true,
  });
}
