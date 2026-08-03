import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";

type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

type DismissResult = {
  ok?: boolean;
  idempotent?: boolean;
  request_id?: string;
  work_order_id?: string | null;
  previous_status?: string;
  status?: string;
};

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function rpcErrorMessage(error: RpcError): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

function rpcErrorStatus(error: RpcError): number {
  const message = rpcErrorMessage(error).toUpperCase();
  if (
    message.includes("AUTHENTICATION") ||
    message.includes("ACCESS_DENIED") ||
    message.includes("ROLE_ACCESS_DENIED") ||
    message.includes("ACTOR_MISMATCH")
  ) {
    return 403;
  }
  if (message.includes("NOT_FOUND_FOR_SHOP")) return 404;
  return 409;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await context.params;
  if (!isUuid(requestId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid requestId." },
      { status: 400 },
    );
  }

  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin", "manager", "advisor", "parts"],
  });
  if (!access.ok) return access.response;

  const rpc = access.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("parts_dismiss_empty_request_atomic", {
    p_shop_id: access.profile.shop_id,
    p_request_id: requestId,
    p_actor_user_id: access.profile.id,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: rpcErrorMessage(error) },
      { status: rpcErrorStatus(error) },
    );
  }

  const result = (data ?? {}) as DismissResult;
  if (!result.ok || result.status !== "cancelled") {
    return NextResponse.json(
      {
        ok: false,
        error: "The empty parts request was not dismissed.",
      },
      { status: 409 },
    );
  }

  if (!result.idempotent) {
    await logOperationalEvent({
      supabase: access.supabase,
      event: "parts_request_empty_dismissed",
      actorId: access.profile.id,
      entityType: "part_requests",
      entityId: requestId,
      details: {
        shop_id: access.profile.shop_id,
        work_order_id: result.work_order_id ?? null,
        previous_status: result.previous_status ?? null,
        status: result.status,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    idempotent: result.idempotent === true,
    requestId,
    status: result.status,
  });
}
