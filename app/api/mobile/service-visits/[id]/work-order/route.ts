import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RpcResult = {
  data: unknown;
  error: { code?: string | null; message: string } | null;
};

type UntypedRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<RpcResult>;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | { operationKey?: string }
    | null;
  const operationKey =
    body?.operationKey?.trim() ||
    request.headers.get("idempotency-key")?.trim() ||
    "";

  if (!id || !operationKey) {
    return NextResponse.json(
      { error: "Service Visit and operation key are required." },
      { status: 400 },
    );
  }

  const rpc = access.supabase.rpc.bind(access.supabase) as unknown as UntypedRpc;
  const { data, error } = await rpc(
    "mobile_materialize_service_visit_work_order_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_visit_id: id,
      p_actor_user_id: access.authUserId,
      p_operation_key: operationKey,
    },
  );

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : error.code === "40001" ? 409 : 400 },
    );
  }

  return NextResponse.json(data);
}
