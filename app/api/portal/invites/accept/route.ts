import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

type Body = {
  inviteId?: string;
  operationKey?: string;
  idempotencyKey?: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id || !user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const inviteId = clean(body?.inviteId);
  const operationKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    clean(body?.operationKey) ||
    clean(body?.idempotencyKey);

  if (!inviteId) {
    return NextResponse.json({ error: "Missing inviteId" }, { status: 400 });
  }
  if (!operationKey) {
    return NextResponse.json(
      { error: "A stable Idempotency-Key is required." },
      { status: 400 },
    );
  }

  const rpc = supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("accept_customer_portal_invite_atomic", {
    p_invite_id: inviteId,
    p_actor_user_id: user.id,
    p_actor_email: user.email,
    p_operation_key: `portal-invite:${user.id}:${operationKey}`,
    p_at: new Date().toISOString(),
  });

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    const lower = message.toLowerCase();
    const status = lower.includes("not found")
      ? 404
      : lower.includes("another account") ||
          lower.includes("does not match") ||
          lower.includes("revoked") ||
          lower.includes("expired")
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(data ?? { ok: true });
}
