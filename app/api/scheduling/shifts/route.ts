// app/api/scheduling/shifts/route.ts
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

type DB = Database;

const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager", "advisor"]);

type Caller = {
  id: string;
  role: string | null;
  shop_id: string | null;
};

function safeRole(v: unknown): string {
  return String(v ?? "").toLowerCase();
}

async function authz() {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle<Caller>();

  if (meErr || !me || !me.shop_id) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Missing shop" }, { status: 403 }),
    };
  }

  const isAdmin = ADMIN_ROLES.has(safeRole(me.role));
  return { ok: true as const, me, isAdmin };
}

type ShiftInsert = Pick<
  DB["public"]["Tables"]["tech_shifts"]["Insert"],
  "user_id" | "shop_id" | "start_time" | "end_time" | "type" | "status"
>;

export async function GET(req: NextRequest) {
  const a = await authz();
  if (!a.ok) return a.res;

  const { searchParams } = new URL(req.url);

  // Expect ISO strings (you’re passing ISO from client)
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const userId = searchParams.get("userId") ?? "";

  const admin = createAdminSupabase();

  let q = admin
    .from("tech_shifts")
    .select("*")
    .eq("shop_id", a.me.shop_id)
    .order("start_time", { ascending: false });

  if (from) q = q.gte("start_time", from);
  if (to) q = q.lte("start_time", to);

  // Non-admins can only read their own shifts
  if (a.isAdmin) {
    if (userId) q = q.eq("user_id", userId);
  } else {
    q = q.eq("user_id", a.me.id);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shifts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const a = await authz();
  if (!a.ok) return a.res;
  if (!a.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        user_id?: string;
        start_time?: string;
        end_time?: string | null;
        type?: string | null;
        status?: string | null;
      }
    | null;

  if (!body?.user_id || !body?.start_time) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // Ensure target is in same shop
  const { data: target, error: tErr } = await admin
    .from("profiles")
    .select("id, shop_id")
    .eq("id", body.user_id)
    .maybeSingle<{ id: string; shop_id: string | null }>();

  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  if (!target || target.shop_id !== a.me.shop_id) {
    return NextResponse.json(
      { error: "Target not in your shop" },
      { status: 403 },
    );
  }

  const payload: ShiftInsert = {
    user_id: body.user_id,
    shop_id: a.me.shop_id,
    start_time: body.start_time,
    end_time: body.end_time ?? null,
    type: (body.type ?? null) as ShiftInsert["type"],
    status: (body.status ?? null) as ShiftInsert["status"],
  };

  const { error } = await admin.from("tech_shifts").insert(payload);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}