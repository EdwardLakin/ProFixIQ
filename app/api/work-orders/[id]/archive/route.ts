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
type ArchiveRpcResult = {
  ok?: boolean;
  idempotent?: boolean;
  archived?: boolean;
  work_order_id?: string;
  customer_id?: string | null;
  archived_at?: string;
};

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>;
};

function archiveErrorResponse(message: string): NextResponse {
  const normalized = message.toUpperCase();
  if (normalized.includes("WORK_ORDER_NOT_FOUND")) {
    return NextResponse.json(
      { ok: false, error: "Work order not found for this shop." },
      { status: 404 },
    );
  }
  if (normalized.includes("ARCHIVE_FORBIDDEN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (normalized.includes("ARCHIVE_ESTIMATE")) {
    return NextResponse.json(
      {
        ok: false,
        error: "Estimates cannot be archived through the work-order action.",
      },
      { status: 409 },
    );
  }
  if (normalized.includes("ARCHIVE_FLEET_LINKED")) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This work order is linked to a Fleet service request. Close or cancel it from the Fleet workflow so the fleet request stays in sync.",
      },
      { status: 409 },
    );
  }
  if (normalized.includes("ARCHIVE_ACTIVE_SERVICE_VISIT")) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This work order has an active Service Visit. Close or cancel the visit before archiving it.",
      },
      { status: 409 },
    );
  }
  if (normalized.includes("ARCHIVE_ACTIVE_LABOR")) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "A technician is still clocked into this work order. End active labor before archiving it.",
      },
      { status: 409 },
    );
  }
  if (normalized.includes("ARCHIVE_FINANCIALLY_LOCKED")) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This work order is financially locked. Keep it in invoice/customer history or use the audited correction flow instead of archiving it.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: false, error: message }, { status: 409 });
}

export async function POST(
  _request: Request,
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

  const rpcClient = access.supabase as unknown as RpcClient;
  const { data, error } = await rpcClient.rpc("archive_work_order_atomic", {
    p_shop_id: access.profile.shop_id,
    p_work_order_id: id,
    p_actor_user_id: access.authUserId,
  });

  if (error) return archiveErrorResponse(error.message);

  const result = (data ?? {}) as ArchiveRpcResult;
  if (!result.ok || !result.archived || !result.work_order_id) {
    return NextResponse.json(
      { ok: false, error: "Archive operation returned an invalid result." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    idempotent: Boolean(result.idempotent),
    workOrderId: result.work_order_id,
    customerId: result.customer_id ?? null,
    archivedAt: result.archived_at ?? null,
    archived: true,
  });
}
