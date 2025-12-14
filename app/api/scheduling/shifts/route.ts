// app/api/scheduling/shifts/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseRoute, createAdminSupabase } from "@/features/shared/lib/supabase/server";

const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager", "advisor"]);

async function authz() {
  const supabase = createServerSupabaseRoute();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false as const, res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const { data: me } = await supabase.from("profiles").select("id, role, shop_id").eq("id", user.id).maybeSingle();
  if (!me || !me.shop_id) return { ok: false as const, res: NextResponse.json({ error: "Missing shop" }, { status: 403 }) };

  const isAdmin = ADMIN_ROLES.has(String(me.role ?? "").toLowerCase());
  return { ok: true as const, me, isAdmin };
}

export async function GET(req: Request) {
  const a = await authz();
  if (!a.ok) return a.res;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const userId = searchParams.get("userId") || "";

  const admin = createAdminSupabase();

  let q = admin
    .from("tech_shifts")
    .select("*")
    .eq("shop_id", a.me.shop_id)
    .order("start_time", { ascending: false });

  if (from) q = q.gte("start_time", from);
  if (to) q = q.lte("start_time", to);

  if (a.isAdmin) {
    if (userId) q = q.eq("user_id", userId);
  } else {
    q = q.eq("user_id", a.me.id);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shifts: data ?? [] });
}

export async function POST(req: Request) {
  const a = await authz();
  if (!a.ok) return a.res;
  if (!a.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.user_id || !body?.start_time) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const admin = createAdminSupabase();

  // Ensure target is in same shop
  const { data: target } = await admin.from("profiles").select("id, shop_id").eq("id", body.user_id).maybeSingle();
  if (!target || target.shop_id !== a.me.shop_id) return NextResponse.json({ error: "Target not in your shop" }, { status: 403 });

  const { error } = await admin.from("tech_shifts").insert({
    user_id: body.user_id,
    shop_id: a.me.shop_id,
    start_time: body.start_time,
    end_time: body.end_time ?? null,
    type: body.type ?? null,
    status: body.status ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}