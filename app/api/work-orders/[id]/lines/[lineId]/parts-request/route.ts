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

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; lineId: string }> },
) {
  const { id: workOrderId, lineId } = await context.params;
  if (!isUuid(workOrderId) || !isUuid(lineId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid work order or repair line." },
      { status: 400 },
    );
  }

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const rawKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    (typeof body?.idempotencyKey === "string"
      ? body.idempotencyKey.trim()
      : "");
  if (!rawKey || rawKey.length > 160) {
    return NextResponse.json(
      { ok: false, error: "A valid idempotency key is required." },
      { status: 400 },
    );
  }

  const { data: line, error: lineError } = await access.supabase
    .from("work_order_lines")
    .select("id")
    .eq("id", lineId)
    .eq("work_order_id", workOrderId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (lineError) {
    return NextResponse.json(
      { ok: false, error: lineError.message },
      { status: 500 },
    );
  }
  if (!line) {
    return NextResponse.json(
      { ok: false, error: "Repair line not found for this shop." },
      { status: 404 },
    );
  }

  const operationKey = `${access.profile.shop_id}:line-request:${lineId}:${rawKey}`;
  const rpc = access.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc(
    "parts_request_work_order_line_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_work_order_id: workOrderId,
      p_work_order_line_id: lineId,
      p_operation_key: operationKey,
      p_actor_user_id: access.profile.id,
    },
  );

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    const status = error.message.includes("NO_LINE_PARTS") ? 400 : 409;
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  return NextResponse.json({ ok: true, result: data });
}
