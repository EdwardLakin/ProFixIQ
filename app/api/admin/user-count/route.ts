import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager", "advisor"]);

export async function GET() {
  const supabaseUser = createServerSupabaseRoute();

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: me, error: meErr } = await supabaseUser
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr || !me || !me.shop_id) {
    return NextResponse.json({ error: "Profile for current user not found" }, { status: 403 });
  }

  const role = String(me.role ?? "").toLowerCase();
  if (!ADMIN_ROLES.has(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminSupabase();

  const { count, error: cErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", me.shop_id);

  if (cErr) {
    return NextResponse.json({ error: cErr.message || "Failed to count users" }, { status: 500 });
  }

  return NextResponse.json({ count: typeof count === "number" ? count : 0 });
}