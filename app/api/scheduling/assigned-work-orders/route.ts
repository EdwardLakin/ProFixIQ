// app/api/scheduling/assigned-work-orders/route.ts
import { NextResponse, type NextRequest } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager", "advisor"]);

type Caller = {
  id: string;
  role: string | null;
  shop_id: string | null;
};

function safeRole(v: unknown): string {
  return String(v ?? "").toLowerCase();
}

async function authz() {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle<Caller>();

  if (meErr || !me || !me.shop_id) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Missing shop" }, { status: 403 }),
    };
  }

  const isAdmin = ADMIN_ROLES.has(safeRole(me.role));
  return { ok: true as const, me, isAdmin };
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
    .order("created_at", { ascending: false })
    .limit(200);

  if (status && status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ workOrders: data ?? [] });
}
