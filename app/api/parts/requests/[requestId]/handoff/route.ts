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

type Body = { idempotencyKey?: string | null };

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
    allowRoles: ["owner", "admin", "manager", "parts"],
  });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const rawKey =
    body?.idempotencyKey?.trim() ||
    req.headers.get("idempotency-key")?.trim() ||
    "";
  if (!rawKey) {
    return NextResponse.json(
      { ok: false, error: "A stable idempotency key is required." },
      { status: 400 },
    );
  }
  if (rawKey.length > 160) {
    return NextResponse.json(
      { ok: false, error: "The idempotency key is too long." },
      { status: 400 },
    );
  }

  const rpc = access.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc(
    "parts_complete_request_handoff_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_request_id: requestId,
      p_actor_user_id: access.profile.id,
      p_operation_key: `${access.profile.shop_id}:parts-handoff:${requestId}:${rawKey}`,
    },
  );

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }

  return NextResponse.json({ ok: true, result: data });
}
