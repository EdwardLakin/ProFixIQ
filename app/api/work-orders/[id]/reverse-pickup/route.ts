import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

type RpcError = { message: string };
type ReversalRpcResult = {
  ok?: boolean;
  reversed?: boolean;
  work_order_id?: string;
  reversed_at?: string;
};

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>;
};

type Body = { reason?: string };

function reversalErrorResponse(message: string): NextResponse {
  const normalized = message.toUpperCase();
  if (normalized.includes("WORK_ORDER_NOT_FOUND")) {
    return NextResponse.json(
      { ok: false, error: "Work order not found for this shop." },
      { status: 404 },
    );
  }
  if (normalized.includes("PICKUP_REVERSAL_FORBIDDEN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (normalized.includes("PICKUP_NOT_CONFIRMED")) {
    return NextResponse.json(
      { ok: false, error: "This work order has no pickup confirmation to reverse." },
      { status: 409 },
    );
  }
  if (normalized.includes("PICKUP_REVERSAL_REASON_REQUIRED")) {
    return NextResponse.json(
      { ok: false, error: "A reason is required to reverse a pickup confirmation." },
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
  const reason = body?.reason?.trim() ?? "";
  if (!reason) {
    return NextResponse.json(
      { ok: false, error: "A reason is required to reverse a pickup confirmation." },
      { status: 400 },
    );
  }

  const rpcClient = access.supabase as unknown as RpcClient;
  const { data, error } = await rpcClient.rpc("reverse_work_order_pickup_atomic", {
    p_shop_id: access.profile.shop_id,
    p_work_order_id: id,
    p_actor_user_id: access.authUserId,
    p_reason: reason,
  });

  if (error) return reversalErrorResponse(error.message);

  const result = (data ?? {}) as ReversalRpcResult;
  if (!result.ok || !result.reversed || !result.work_order_id) {
    return NextResponse.json(
      { ok: false, error: "Pickup reversal returned an invalid result." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    workOrderId: result.work_order_id,
    reversedAt: result.reversed_at ?? null,
    reversed: true,
  });
}
