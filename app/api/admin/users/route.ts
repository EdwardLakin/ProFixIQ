// app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

const MAX_ROWS = 200;

export async function GET(req: Request) {
  // 1) use route-scoped client (has cookies) to know WHO is calling
  const supabaseUser = createServerSupabaseRoute();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  // who is authenticated?
  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // load THEIR profile (this works with RLS because it's their own row)
  const { data: me, error: meErr } = await supabaseUser
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr || !me) {
    return NextResponse.json(
      { error: "Profile for current user not found" },
      { status: 403 },
    );
  }

  // 2) now use ADMIN client to actually read other profiles in the same shop
  const adminSupabase = createAdminSupabase();

  let query = adminSupabase
    .from("profiles")
    .select("id, full_name, email, phone, role, created_at, shop_id")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  // everyone is scoped to their shop
  if (me.shop_id) {
    query = query.eq("shop_id", me.shop_id);
  }

  // optional search
  if (q) {
    query = query.or(
      `full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`,
    );
  }

  const { data: users, error: usersErr } = await query;

  if (usersErr) {
    return NextResponse.json(
      { error: usersErr.message || "Failed to load users" },
      { status: 500 },
    );
  }

  return NextResponse.json({ users: users ?? [] });
}