import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";


export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id")
    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();

  if (profileError || !profile?.shop_id) {
    return NextResponse.json(
      { error: "Unable to resolve shop context" },
      { status: 400 },
    );
  }

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  let query = supabase
    .from("menu_items")
    .select("id, name")
    .eq("shop_id", profile.shop_id)
    .order("name", { ascending: true })
    .limit(25);

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    items: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name ?? row.id,
    })),
  });
}
