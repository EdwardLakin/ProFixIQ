// app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

const MAX_ROWS = 500;
const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager", "advisor"]);

export async function GET(req: Request) {
  const supabaseUser = createServerSupabaseRoute();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

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

  let query = admin
    .from("profiles")
    .select("id, full_name, email, phone, role, created_at, shop_id")
    .eq("shop_id", me.shop_id)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data: users, error: usersErr } = await query;

  if (usersErr) {
    return NextResponse.json({ error: usersErr.message || "Failed to load users" }, { status: 500 });
  }

  return NextResponse.json({ users: users ?? [] });
}