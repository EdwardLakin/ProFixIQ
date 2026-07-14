import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type RpcError = { message: string };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor", "technician"],
  });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const workOrderId = id.trim();
  if (!workOrderId) {
    return NextResponse.json({ error: "Missing work order id" }, { status: 400 });
  }

  const admin = createClient<DB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const rpc = admin as unknown as RpcClient;
  const { data, error } = await rpc.rpc("work_order_financial_lock_state", {
    p_shop_id: access.profile.shop_id,
    p_work_order_id: workOrderId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, lock: data });
}
