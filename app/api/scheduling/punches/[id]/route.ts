import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
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

function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || v.length < 10) return false;
  const d = new Date(v);
  return Number.isFinite(d.getTime());
}

type PunchEventTypeDb =
  | "start_shift"
  | "end_shift"
  | "break_start"
  | "break_end"
  | "lunch_start"
  | "lunch_end";

function isPunchEventTypeDb(v: unknown): v is PunchEventTypeDb {
  return (
    v === "start_shift" ||
    v === "end_shift" ||
    v === "break_start" ||
    v === "break_end" ||
    v === "lunch_start" ||
    v === "lunch_end"
  );
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

type RouteContext = { params: Promise<{ id: string }> };

type PunchUpdateBody = {
  timestamp?: unknown;
  event_type?: unknown;
};

async function loadPunchWithShift(admin: ReturnType<typeof createAdminSupabase>, punchId: string) {
  const { data, error } = await admin
    .from("punch_events")
    .select("id, shift_id, event_type, timestamp, tech_shifts:shift_id(shop_id,user_id)")
    .eq("id", punchId)
    .maybeSingle<{
      id: string;
      shift_id: string | null;
      event_type: string | null;
      timestamp: string | null;
      tech_shifts: { shop_id: string | null; user_id: string | null } | null;
    }>();

  return { data, error };
}

/* --------------------------------------------------------- */
/* DELETE                                                     */
/* --------------------------------------------------------- */
export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { id: punchId } = await context.params;

  const a = await authz();
  if (!a.ok) return a.res;

  const admin = createAdminSupabase();

  const { data: punch, error: pErr } = await loadPunchWithShift(admin, punchId);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!punch || !punch.tech_shifts) {
    return NextResponse.json({ error: "Punch not found" }, { status: 404 });
  }

  // Shop scope
  if (punch.tech_shifts.shop_id !== a.me.shop_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rule A: only admins or shift owner can delete
  if (!a.isAdmin && punch.tech_shifts.user_id !== a.me.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await admin.from("punch_events").delete().eq("id", punchId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/* --------------------------------------------------------- */
/* PATCH (update punch)                                      */
/* --------------------------------------------------------- */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id: punchId } = await context.params;

  const a = await authz();
  if (!a.ok) return a.res;

  const body = (await req.json().catch(() => null)) as PunchUpdateBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.timestamp === undefined && body.event_type === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const admin = createAdminSupabase();

  const { data: punch, error: pErr } = await loadPunchWithShift(admin, punchId);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!punch || !punch.tech_shifts) {
    return NextResponse.json({ error: "Punch not found" }, { status: 404 });
  }

  // Shop scope
  if (punch.tech_shifts.shop_id !== a.me.shop_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rule A: only admins or shift owner can edit
  if (!a.isAdmin && punch.tech_shifts.user_id !== a.me.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const update: DB["public"]["Tables"]["punch_events"]["Update"] = {};

  if (body.timestamp !== undefined) {
    if (!isIsoDate(body.timestamp)) {
      return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
    }
    update.timestamp = body.timestamp;
  }

  if (body.event_type !== undefined) {
    if (!isPunchEventTypeDb(body.event_type)) {
      return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
    }
    update.event_type = body.event_type;
  }

  const { error } = await admin.from("punch_events").update(update).eq("id", punchId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}