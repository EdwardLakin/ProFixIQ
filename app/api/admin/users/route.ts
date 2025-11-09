// app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";


const MAX_ROWS = 200;

export async function GET(req: Request) {
  const supabase = createServerSupabaseRoute();

  // 1) who is calling?
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 2) load *their* profile to get shop_id
  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr || !me) {
    return NextResponse.json(
      { error: "Profile for current user not found" },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  // 3) fetch everyone in the same shop
  let query = supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, created_at, shop_id")
    .eq("shop_id", me.shop_id)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (q.length) {
    query = query.or(
      `full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}
