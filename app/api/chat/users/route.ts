//// app/api/chat/users/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export async function GET() {
  const supabase = createServerSupabaseRoute();

  // who is calling?
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // get their profile to know shop_id
  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("id, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr || !me) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  // list users in same shop
  const { data: rows, error: listErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, email") // 👈 include email for the modal
    .eq("shop_id", me.shop_id)
    .order("full_name", { ascending: true });

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  return NextResponse.json({ users: rows ?? [] });
}