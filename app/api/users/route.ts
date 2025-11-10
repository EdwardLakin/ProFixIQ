import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const MAX = 200;

export async function GET(_req: NextRequest) {
  // 1️⃣ Get current user
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 2️⃣ Fetch current user's profile to find shop_id
  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("id, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr || !me?.shop_id) {
    return NextResponse.json(
      { error: "User profile not found or missing shop_id" },
      { status: 403 },
    );
  }

  // 3️⃣ Fetch everyone in the same shop using service key (bypass RLS)
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .eq("shop_id", me.shop_id)
    .order("full_name", { ascending: true })
    .limit(MAX);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}