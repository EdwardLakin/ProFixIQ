// app/api/chat/users/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_ROWS = 200;

export async function GET(req: Request) {
  const userClient = createServerSupabaseRoute();
  const admin = createAdminSupabase();

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  // who is calling
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // find caller's profile by either key (handles id vs user_id)
  const { data: me, error: meErr } = await userClient
    .from("profiles")
    .select("id, user_id, shop_id")
    .or(`user_id.eq.${user.id},id.eq.${user.id}`)
    .maybeSingle();
  if (meErr || !me) {
    return NextResponse.json(
      { error: "Profile not found for current user" },
      { status: 403 },
    );
  }

  const shopId = me.shop_id ?? null;

  // helper to build a profiles query (admin bypasses RLS)
  const buildQuery = (sameShopOnly: boolean) => {
    let qry = admin
      .from("profiles")
      .select("id, user_id, full_name, role, email, shop_id")
      .order("full_name", { ascending: true })
      .limit(MAX_ROWS);

    if (sameShopOnly && shopId) qry = qry.eq("shop_id", shopId);
    if (q) {
      qry = qry.or(
        `full_name.ilike.%${q}%,email.ilike.%${q}%,role.ilike.%${q}%`,
      );
    }
    return qry;
  };

  // 1) try same-shop first
  const { data: sameShop, error: sameErr } = await buildQuery(true);
  if (sameErr) {
    return NextResponse.json(
      { error: sameErr.message ?? "Failed to load users" },
      { status: 500 },
    );
  }

  // 2) fallback to all if list is too small (e.g., only yourself)
  let list = sameShop ?? [];
  if (!list || list.length < 2) {
    const { data: allUsers, error: allErr } = await buildQuery(false);
    if (allErr) {
      return NextResponse.json(
        { error: allErr.message ?? "Failed to load users" },
        { status: 500 },
      );
    }
    list = allUsers ?? [];
  }

  // normalize id; keep your own row (handy for solo testing)
  const normalized =
    list.map((u) => ({
      id: u.id ?? u.user_id,
      full_name: u.full_name,
      role: u.role,
      email: u.email,
    })) ?? [];

  return NextResponse.json({ users: normalized });
}