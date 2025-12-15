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

type PunchCreateBody = {
  shift_id?: string;
  event_type?: unknown;
  timestamp?: unknown;
  note?: unknown;
};

export async function POST(req: NextRequest) {
  const a = await authz();
  if (!a.ok) return a.res;

  const body = (await req.json().catch(() => null)) as PunchCreateBody | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  if (!body.shift_id) {
    return NextResponse.json({ error: "Missing shift_id" }, { status: 400 });
  }
  if (!isPunchEventTypeDb(body.event_type)) {
    return NextResponse.json(
      { error: "Invalid event_type" },
      { status: 400 },
    );
  }
  if (!isIsoDate(body.timestamp)) {
    return NextResponse.json(
      { error: "Invalid timestamp" },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase();

  // Verify shift exists + belongs to caller shop
  const { data: shift, error: sErr } = await admin
    .from("tech_shifts")
    .select("id, shop_id, user_id")
    .eq("id", body.shift_id)
    .maybeSingle<{ id: string; shop_id: string | null; user_id: string | null }>();

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!shift) return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  if (shift.shop_id !== a.me.shop_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rule A: punches belong to the shift owner unless admin
  if (!a.isAdmin && shift.user_id !== a.me.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const note =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim()
      : null;

  const { error } = await admin.from("punch_events").insert({
    shift_id: body.shift_id,
    event_type: body.event_type,
    timestamp: body.timestamp,
    note,
  } satisfies DB["public"]["Tables"]["punch_events"]["Insert"]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
