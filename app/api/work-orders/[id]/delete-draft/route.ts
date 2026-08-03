import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;

const admin = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
    const originalError = rpcErrorMessage(error).toUpperCase();
    const canTryEmptyShellDelete =
      originalError.includes("WORK_ORDER_DELETE_NOT_DRAFT") ||
      originalError.includes("WORK_ORDER_DELETE_FINANCIAL_OR_APPROVAL_HISTORY");
    if (canTryEmptyShellDelete) {
      const emptyShellRpc = admin as unknown as RpcClient;
      const fallback = await emptyShellRpc.rpc(
        "work_order_delete_empty_shell_atomic",
        {
          p_shop_id: access.profile.shop_id,
          p_work_order_id: id,
          p_operation_key: `${access.profile.shop_id}:delete-empty-work-order:${id}`,
          p_actor_user_id: access.profile.id,
        },
      );
      if (!fallback.error) {
        const fallbackResult = (fallback.data ?? {}) as DeleteDraftResult;
        if (fallbackResult.ok && fallbackResult.deleted) {
          return NextResponse.json({
            ok: true,
            idempotent: fallbackResult.idempotent === true,
            workOrderId: fallbackResult.work_order_id ?? id,
            deleted: true,
          });
        }
      }
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          "Only an empty work order with no invoice, payment, approval, labor, parts, or inspection history can be deleted.",
      },
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
