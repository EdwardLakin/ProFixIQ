import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type DB = Database;

type Caller = {
  id: string;
  role: string | null;
  shop_id: string | null;
};

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

  const actor = getActorCapabilities({ role: me.role });
  const isAdmin = actor.isKnownRole && actor.canManageScheduling;
  return { ok: true as const, me, isAdmin };
}

/* --------------------------------------------------------- */
/* GET /api/scheduling/sessions                              */
/* --------------------------------------------------------- */
export async function GET(req: NextRequest) {
  const a = await authz();
  if (!a.ok) return a.res;
  if (!a.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const userId = url.searchParams.get("user_id") || null;
  const role = url.searchParams.get("role") || "all";

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // Optional role filter -> staff ids
  let staffIds: string[] | null = null;
  if (role !== "all") {
    const { data: staff, error: staffErr } = await admin
      .from("profiles")
      .select("id")
      .eq("shop_id", a.me.shop_id)
      .eq("role", role);

    if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 500 });

    staffIds = (staff ?? []).map((r) => r.id);
    if (staffIds.length === 0) {
      return NextResponse.json({ sessions: [], lines: [] });
    }
  }

  let q = admin
    .from("tech_sessions")
    .select("*")
    .eq("shop_id", a.me.shop_id)
    .gte("started_at", from)
    .lt("started_at", to)
    .order("started_at", { ascending: false });

  if (userId) q = q.eq("user_id", userId);
  if (staffIds) q = q.in("user_id", staffIds);

  const { data: sessions, error: sErr } = await q;
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const woIds = Array.from(
    new Set(
      (sessions ?? [])
        .map((s) => s.work_order_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  );

  let lines: DB["public"]["Tables"]["work_order_lines"]["Row"][] = [];
  if (woIds.length > 0) {
    const { data: l, error: lErr } = await admin
      .from("work_order_lines")
      .select("*")
      .eq("line_type", "job")
      .in("work_order_id", woIds);

    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
    lines = (l ?? []) as typeof lines;
  }

  return NextResponse.json({ sessions: sessions ?? [], lines });
}

/* --------------------------------------------------------- */
/* POST /api/scheduling/sessions                             */
/* --------------------------------------------------------- */
export async function POST(_req: NextRequest) {
  const a = await authz();
  if (!a.ok) return a.res;
  if (!a.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(
    {
      error:
        "Legacy job sessions are read-only. Correct canonical labor segments from Workforce time review.",
    },
    { status: 410 },
  );
}
