import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

export function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function idempotencyKey(
  req: Request,
  body: Record<string, unknown>,
  _legacyFallback?: string,
): string | null {
  const header = req.headers.get("Idempotency-Key")?.trim();
  const camel = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  const snake = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";

  // The optional third argument exists only so older route callers compile during
  // the Phase 3 transition. It is deliberately ignored: retryable operations must
  // receive a stable key from the caller rather than deriving one from payload data.
  return header || camel || snake || null;
}

type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

export async function runPartsLifecycleRpc(
  _req: Request,
  rpcName: string,
  args: Record<string, unknown>,
) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const rawKey =
    typeof args.p_idempotency_key === "string" ? args.p_idempotency_key.trim() : "";
  if (!rawKey) {
    return NextResponse.json(
      { ok: false, error: "A stable idempotency key is required." },
      { status: 400 },
    );
  }

  const scopedArgs = {
    ...args,
    p_idempotency_key: `${access.profile.shop_id}:${rpcName}:${rawKey}`,
  };
  const rpc = access.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc(rpcName, scopedArgs);
  if (error) {
    const message = [error.message, error.details, error.hint].filter(Boolean).join(" — ");
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
  return NextResponse.json({ ok: true, result: data });
}
