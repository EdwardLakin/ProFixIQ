// app/api/chat/users/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_ROWS = 200;

export async function GET(req: Request) {
  const supabaseUser = createServerSupabaseRoute();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  // who is calling
  const {
    data: { user },
    error: authErr,
  } = await supabaseUser.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 👇 try BOTH columns: user_id first, then id
  const { data: me, error: meErr } = await supabaseUser
    .from("profiles")
    .select("id, user_id, shop_id")
    .or(`user_id.eq.${user.id},id.eq.${user.id}`) // ← this is the key change
    .maybeSingle();

  if (meErr || !me) {
    return NextResponse.json(
      { error: "Profile not found for current user" },
      { status: 403 },
    );
  }

  const shopId = me.shop_id;

  // now read other users with the service role
  const admin = createAdminSupabase();

  let query = admin
    .from("profiles")
    .select("id, user_id, full_name, role, email, shop_id")
    .order("full_name", { ascending: true })
    .limit(MAX_ROWS);

  if (shopId) {
    query = query.eq("shop_id", shopId);
  }

  if (q) {
    query = query.or(
      `full_name.ilike.%${q}%,email.ilike.%${q}%,role.ilike.%${q}%`,
    );
  }

  const { data: users, error: listErr } = await query;

  if (listErr) {
    return NextResponse.json(
      { error: listErr.message ?? "Failed to load users" },
      { status: 500 },
    );
  }

  // 👇 normalize: always return .id with a value
  const normalized =
    users?.map((u) => ({
      id: u.id ?? u.user_id, // ← important
      full_name: u.full_name,
      role: u.role,
      email: u.email,
    })) ?? [];

  return NextResponse.json({ users: normalized });
}