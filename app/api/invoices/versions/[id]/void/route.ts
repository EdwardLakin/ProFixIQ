import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type RpcClient = ReturnType<typeof createClient<DB>> & {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

type Body = { reason?: string; idempotencyKey?: string };

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });
  if (!access.ok) return access.response;

  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => null)) as Body | null;
    const reason = body?.reason?.trim() ?? "";
    const idempotencyKey =
      body?.idempotencyKey?.trim() || req.headers.get("idempotency-key")?.trim() || "";
    if (!reason) return NextResponse.json({ error: "Void reason is required" }, { status: 400 });
    if (!idempotencyKey) {
      return NextResponse.json({ error: "An idempotency key is required" }, { status: 400 });
    }

    const admin = createClient<DB>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    ) as RpcClient;
    const { data, error } = await admin.rpc("void_invoice_version", {
      p_shop_id: access.profile.shop_id,
      p_invoice_version_id: id,
      p_actor_user_id: access.profile.id,
      p_reason: reason,
      p_operation_key: `void:${access.profile.shop_id}:${idempotencyKey}`,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ ok: true, invoiceVersion: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to void invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
