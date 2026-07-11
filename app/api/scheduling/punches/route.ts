import { NextResponse, type NextRequest } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  isPunchEventType,
  type PunchEventType,
} from "@/features/workforce/lib/shift-status";
import { closeAllActiveTechnicianJobLabor } from "@/features/work-orders/server/technicianJobLabor";

type Caller = {
  id: string;
  role: string | null;
  shop_id: string | null;
};

function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || v.length < 10) return false;
  const d = new Date(v);
  return Number.isFinite(d.getTime());
}

type PunchEventTypeDb = PunchEventType;

function isPunchEventTypeDb(v: unknown): v is PunchEventTypeDb {
  return isPunchEventType(v);
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

  const actor = getActorCapabilities({ role: me.role });
  const isAdmin = actor.isKnownRole && actor.canManageScheduling;
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
  if (!body)
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  if (!body.shift_id) {
    return NextResponse.json({ error: "Missing shift_id" }, { status: 400 });
  }
  if (!isPunchEventTypeDb(body.event_type)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }
  if (!isIsoDate(body.timestamp)) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // Verify shift exists + belongs to caller shop
  const { data: shift, error: sErr } = await admin
    .from("tech_shifts")
    .select("id, shop_id, user_id")
    .eq("id", body.shift_id)
    .maybeSingle<{
      id: string;
      shop_id: string | null;
      user_id: string | null;
    }>();

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!shift)
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  if (shift.shop_id !== a.me.shop_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rule A: punches belong to the shift owner unless admin
  if (!a.isAdmin && shift.user_id !== a.me.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (body.event_type === "end_shift" && shift.user_id) {
    const closed = await closeAllActiveTechnicianJobLabor({
      supabase: admin,
      shopId: a.me.shop_id as string,
      technicianId: shift.user_id,
      endedAtIso: body.timestamp,
      reason: "shift_end",
      event: "job_stopped_at_end_day",
    });

    if (!closed.ok) {
      return NextResponse.json(
        {
          error: `Unable to stop active job timers before ending shift: ${closed.error}`,
        },
        { status: closed.status },
      );
    }
  }

  const note =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim()
      : null;

  const payload = {
    shop_id: a.me.shop_id,
    shift_id: body.shift_id,
    user_id: shift.user_id ?? a.me.id,
    profile_id: shift.user_id ?? a.me.id,
    event_type: body.event_type,
    timestamp: body.timestamp,
    note,
  };
  const { error } = await admin.from("punch_events").insert(payload as never);
  if (error && error.message.includes("shop_id")) {
    const withoutShopId = { ...payload };
    delete (withoutShopId as { shop_id?: string | null }).shop_id;
    const retry = await admin
      .from("punch_events")
      .insert(withoutShopId as never);
    if (retry.error)
      return NextResponse.json({ error: retry.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
