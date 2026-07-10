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

type ProfileIdentity = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type AttendanceShift = DB["public"]["Tables"]["tech_shifts"]["Row"] & {
  userId: string | null;
  employeeName: string;
  employeeEmail: string | null;
  employee: {
    id: string | null;
    name: string;
    email: string | null;
  };
};

function employeeNameFromProfile(profile: Pick<ProfileIdentity, "full_name" | "email"> | undefined): string {
  const fullName = profile?.full_name?.trim();
  if (fullName) return fullName;

  const email = profile?.email?.trim();
  if (email) return email;

  return "Unknown employee";
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

/* --------------------------------------------------------- */
/* GET  /api/scheduling/shifts                               */
/* --------------------------------------------------------- */
export async function GET(req: NextRequest) {
  const a = await authz();
  if (!a.ok) return a.res;
  if (!a.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const userId = url.searchParams.get("user_id") || null;
  const role = url.searchParams.get("role") || "all";

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // Optional role filter
  let staffIds: string[] | null = null;
  if (role !== "all") {
    const { data: staff, error: staffErr } = await admin
      .from("profiles")
      .select("id")
      .eq("shop_id", a.me.shop_id)
      .eq("role", role);

    if (staffErr) {
      return NextResponse.json({ error: staffErr.message }, { status: 500 });
    }

    staffIds = (staff ?? []).map((r) => r.id);
    if (staffIds.length === 0) {
      return NextResponse.json({ shifts: [], punches: [], billableMinutes: 0 });
    }
  }

  // Shifts
  let shiftQ = admin
    .from("tech_shifts")
    .select("*")
    .eq("shop_id", a.me.shop_id)
    .gte("start_time", from)
    .lte("start_time", to)
    .order("start_time", { ascending: false });

  if (userId) shiftQ = shiftQ.eq("user_id", userId);
  if (staffIds) shiftQ = shiftQ.in("user_id", staffIds);

  const { data: shifts, error: sErr } = await shiftQ;
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const shiftRows = (shifts ?? []) as DB["public"]["Tables"]["tech_shifts"]["Row"][];
  const shiftIds = shiftRows.map((s) => s.id).filter(Boolean) as string[];
  const shiftUserIds = Array.from(
    new Set(
      shiftRows
        .map((s) => (typeof s.user_id === "string" ? s.user_id : null))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const profilesById = new Map<string, ProfileIdentity>();
  if (shiftUserIds.length > 0) {
    const { data: profileRows, error: profileErr } = await admin
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("shop_id", a.me.shop_id)
      .in("id", shiftUserIds);

    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

    for (const profile of (profileRows ?? []) as ProfileIdentity[]) {
      profilesById.set(profile.id, profile);
    }
  }

  const attendanceShifts: AttendanceShift[] = shiftRows.map((shift) => {
    const userId = typeof shift.user_id === "string" ? shift.user_id : null;
    const profile = userId ? profilesById.get(userId) : undefined;
    const employeeName = employeeNameFromProfile(profile);
    const employeeEmail = profile?.email?.trim() || null;

    return {
      ...shift,
      userId,
      employeeName,
      employeeEmail,
      employee: {
        id: profile?.id ?? null,
        name: employeeName,
        email: employeeEmail,
      },
    };
  });

  // Punches
  let punches: DB["public"]["Tables"]["punch_events"]["Row"][] = [];
  if (shiftIds.length > 0) {
    const { data: pRows, error: pErr } = await admin
      .from("punch_events")
      .select("*")
      .in("shift_id", shiftIds)
      .order("timestamp", { ascending: true });

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    punches = (pRows ?? []) as typeof punches;
  }

  // Billable minutes (work_order_lines)
  let woQ = admin
    .from("work_order_lines")
    .select("labor_time, user_id, assigned_tech_id, created_at, shop_id")
    .eq("shop_id", a.me.shop_id)
    .gte("created_at", from)
    .lte("created_at", to);

  if (userId) {
    woQ = woQ.or(`user_id.eq.${userId},assigned_tech_id.eq.${userId}`);
  } else if (staffIds) {
    woQ = woQ.or(
      `user_id.in.(${staffIds.join(",")}),assigned_tech_id.in.(${staffIds.join(",")})`,
    );
  }

  const { data: lines, error: lErr } = await woQ;
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

  let billableMinutes = 0;
  for (const r of (lines ?? []) as Array<{ labor_time: number | null }>) {
    const hrs = typeof r.labor_time === "number" ? r.labor_time : 0;
    billableMinutes += Math.max(0, hrs) * 60;
  }

  return NextResponse.json({
    shifts: attendanceShifts,
    punches,
    billableMinutes,
  });
}

/* --------------------------------------------------------- */
/* POST /api/scheduling/shifts                               */
/* --------------------------------------------------------- */
export async function POST() {
  return NextResponse.json(
    { error: "Shift lifecycle writes must use the canonical shift API." },
    { status: 410 },
  );
}
