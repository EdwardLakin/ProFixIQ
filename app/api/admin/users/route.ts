import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const MAX_ROWS = 200;

export async function GET(req: Request) {
  try {
    const supabase = createAdminSupabase();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";

    // Identify current user
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Load their profile to get role + shop_id
    const { data: me, error: meErr } = await supabase
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

    // Query all users in the same shop
    let query = supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, created_at, shop_id")
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);

    if (me.shop_id) {
      query = query.eq("shop_id", me.shop_id);
    }

    // Optional search filter
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
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Unknown error" },
      { status: 500 },
    );
  }
}