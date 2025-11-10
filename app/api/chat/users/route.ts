// app/api/chat/users/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 200;

export async function GET(req: Request) {
  const supabaseUser = createServerSupabaseRoute();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  // who is calling?
  const {
    data: { user },
    error: authErr,
  } = await supabaseUser.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // their profile (RLS-safe)
  const { data: me, error: meErr } = await supabaseUser
    .from("profiles")
    .select("id, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr || !me) {
    return NextResponse.json(
      { error: "Profile not found for current user" },
      { status: 403 },
    );
  }

  const admin = createAdminSupabase();

  let query = admin
    .from("profiles")
    .select("id, full_name, role, email, shop_id")
    .order("full_name", { ascending: true })
    .limit(MAX_ROWS);

  // only filter if user actually has a shop
  if (me.shop_id) {
    query = query.eq("shop_id", me.shop_id);
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

  return NextResponse.json({ users: users ?? [] });
}