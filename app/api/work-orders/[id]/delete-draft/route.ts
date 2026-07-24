import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

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

type DeleteDraftResult = {
  ok?: boolean;
  idempotent?: boolean;
  work_order_id?: string;
  deleted?: boolean;
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

export async function DELETE(
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
    allowRoles: ["owner", "admin"],
  });
  if (!access.ok) return access.response;

  const operationKey = `${access.profile.shop_id}:delete-draft-work-order:${id}`;
  const rpc = access.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("work_order_delete_draft_atomic", {
    p_shop_id: access.profile.shop_id,
    p_work_order_id: id,
    p_operation_key: operationKey,
    p_actor_user_id: access.profile.id,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: rpcErrorMessage(error) },
      { status: rpcErrorStatus(error) },
    );
  }

  const result = (data ?? {}) as DeleteDraftResult;
  if (!result.ok || !result.deleted) {
    return NextResponse.json(
      { ok: false, error: "The work order was not deleted." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    idempotent: result.idempotent === true,
    workOrderId: result.work_order_id ?? id,
    deleted: true,
  });
}
