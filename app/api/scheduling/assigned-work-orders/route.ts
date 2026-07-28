// app/api/scheduling/assigned-work-orders/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { WORKFORCE_STAFF_ROLES } from "@/features/workforce/lib/roster";

async function authz() {
  const access = await requireShopScopedApiAccess({
    allowRoles: [...WORKFORCE_STAFF_ROLES],
  });
  if (!access.ok) {
    return { ok: false as const, res: access.response };
  }
  const actor = getActorCapabilities({ role: access.profile.role });
  const isAdmin = actor.isKnownRole && actor.canManageScheduling;
  return { ok: true as const, me: access.profile, isAdmin };
}

export async function GET(req: NextRequest) {
  const a = await authz();
  if (!a.ok) return a.res;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  const shopId = searchParams.get("shop_id");
  const status = searchParams.get("status") ?? "open"; // optional

  if (!shopId || !userId) {
    return NextResponse.json(
      { error: "Missing shop_id or user_id" },
      { status: 400 },
    );
  }

  if (shopId !== a.me.shop_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // non-admin can only query self
  const effectiveUserId = a.isAdmin ? userId : a.me.id;

  const admin = createAdminSupabase();

  let q = admin
    .from("work_orders")
    .select("id, custom_id, status, vehicle_id")
    .eq("shop_id", shopId)
    .eq("assigned_tech", effectiveUserId)
    .neq("type", "historical_import")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status && status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ workOrders: data ?? [] });
}
