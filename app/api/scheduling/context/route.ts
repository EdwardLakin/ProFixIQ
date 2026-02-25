// app/api/scheduling/context/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager", "advisor"]);

export async function GET() {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr || !me || !me.shop_id) {
    return NextResponse.json(
      { error: "Profile not found or missing shop" },
      { status: 403 },
    );
  }

  const canEditAll = ADMIN_ROLES.has(String(me.role ?? "").toLowerCase());

  let users: Array<{
    id: string;
    full_name: string | null;
    role: string | null;
    shop_id: string | null;
  }> = [];

  if (canEditAll) {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name, role, shop_id")
      .eq("shop_id", me.shop_id)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    users = data ?? [];
  }

  return NextResponse.json({
    me,
    shopId: me.shop_id,
    canEditAll,
    users,
  });
}
