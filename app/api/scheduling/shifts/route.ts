import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { buildWorkforceActivity } from "@/features/workforce/server/buildWorkforceActivity";
import {
  overlapMinutes,
  sumPairedOverlapDurations,
} from "@/features/workforce/lib/activityMetrics";
import {
  composeActiveWorkforceRoster,
  workforceDisplayName,
} from "@/features/workforce/lib/roster";

type DB = Database;

type ProfileIdentity = {
  id: string;
  full_name: string | null;
  username: string | null;
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

function employeeNameFromProfile(
  profile:
    | Pick<ProfileIdentity, "full_name" | "username" | "email">
    | undefined,
): string {
  return workforceDisplayName(profile);
}

function activityLabel(value: string | undefined) {
  if (value === "working_on_job") return "Working on job";
  if (value === "clocked_in_idle") return "Clocked in — no active job";
  if (value === "on_break") return "On break";
  if (value === "on_lunch") return "On lunch";
  if (value === "shift_ended") return "Shift ended";
  return "No shift recorded";
}

export async function GET(req: NextRequest) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const userId = url.searchParams.get("user_id") || null;
  const role = url.searchParams.get("role") || "all";

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
  }
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return NextResponse.json(
      { error: "Invalid from/to range" },
      { status: 400 },
    );
  }
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();

  const admin = createAdminSupabase();
  const shopId = access.profile.shop_id;
  const [shopRes, profilesRes, workforceRes] = await Promise.all([
    admin.from("shops").select("timezone").eq("id", shopId).maybeSingle(),
    admin
      .from("profiles")
      .select("id, full_name, username, email, role")
      .eq("shop_id", shopId)
      .order("full_name", { ascending: true }),
    admin
      .from("people_workforce_profiles")
      .select("user_id, employment_status")
      .eq("shop_id", shopId),
  ]);
  const setupError =
    shopRes.error ?? profilesRes.error ?? workforceRes.error ?? null;
  if (setupError) {
    return NextResponse.json({ error: setupError.message }, { status: 500 });
  }

  const allProfiles = (profilesRes.data ?? []) as ProfileIdentity[];
  const profileById = new Map(
    allProfiles.map((profile) => [profile.id, profile]),
  );
  const activeRosterIds = new Set(
    composeActiveWorkforceRoster({
      profiles: allProfiles,
      workforceProfiles: workforceRes.data ?? [],
    }).map((person) => person.id),
  );
  const rosterProfiles = allProfiles.filter((profile) => {
    if (!activeRosterIds.has(profile.id)) return false;
    if (role !== "all" && profile.role !== role) return false;
    if (userId && profile.id !== userId) return false;
    return true;
  });
  const roleStaffIds =
    role === "all" ? null : rosterProfiles.map((profile) => profile.id);

  let shiftQuery = admin
    .from("tech_shifts")
    .select("*")
    .eq("shop_id", shopId)
    .lt("start_time", toIso)
    .or(`end_time.is.null,end_time.gt.${fromIso}`)
    .order("start_time", { ascending: false });

  if (userId) shiftQuery = shiftQuery.eq("user_id", userId);
  if (roleStaffIds?.length) {
    shiftQuery = shiftQuery.in("user_id", roleStaffIds);
  }

  const { data: shifts, error: shiftError } =
    roleStaffIds && roleStaffIds.length === 0
      ? { data: [], error: null }
      : await shiftQuery;
  if (shiftError) {
    return NextResponse.json({ error: shiftError.message }, { status: 500 });
  }

  const shiftRows = (shifts ?? []) as DB["public"]["Tables"]["tech_shifts"]["Row"][];
  const shiftIds = shiftRows.map((shift) => shift.id).filter(Boolean);
  const attendanceShifts: AttendanceShift[] = shiftRows.map((shift) => {
    const shiftUserId =
      typeof shift.user_id === "string" ? shift.user_id : null;
    const profile = shiftUserId ? profileById.get(shiftUserId) : undefined;
    const employeeName = employeeNameFromProfile(profile);
    const employeeEmail = profile?.email?.trim() || null;
    return {
      ...shift,
      userId: shiftUserId,
      employeeName,
      employeeEmail,
      employee: {
        id: profile?.id ?? null,
        name: employeeName,
        email: employeeEmail,
      },
    };
  });

  let punches: DB["public"]["Tables"]["punch_events"]["Row"][] = [];
  if (shiftIds.length > 0) {
    const { data, error } = await admin
      .from("punch_events")
      .select("*")
      .in("shift_id", shiftIds)
      .order("timestamp", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    punches = (data ?? []) as typeof punches;
  }

  const currentMs = Date.now();
  const isLiveDay = currentMs >= fromMs && currentMs < toMs;
  const activityAt = isLiveDay
    ? new Date(currentMs)
    : currentMs < fromMs
      ? new Date(fromMs)
      : new Date(toMs - 1);
  const rawActivity = await buildWorkforceActivity({
    shopId,
    timezone: shopRes.data?.timezone ?? null,
    now: activityAt,
  });
  const visibleRosterIds = new Set(rosterProfiles.map((profile) => profile.id));
  const activities = rawActivity.activities.filter((row) =>
    visibleRosterIds.has(row.userId),
  );
  const activityFeed = rawActivity.feed.filter(
    (row) => row.userId !== null && visibleRosterIds.has(row.userId),
  );
  const activityByUser = new Map(
    rawActivity.activities.map((row) => [row.userId, row]),
  );

  const shiftsByUser = new Map<
    string,
    DB["public"]["Tables"]["tech_shifts"]["Row"][]
  >();
  for (const shift of shiftRows) {
    if (!shift.user_id) continue;
    shiftsByUser.set(shift.user_id, [
      ...(shiftsByUser.get(shift.user_id) ?? []),
      shift,
    ]);
  }
  const punchesByShift = new Map<string, typeof punches>();
  for (const punch of punches) {
    if (!punch.shift_id) continue;
    punchesByShift.set(punch.shift_id, [
      ...(punchesByShift.get(punch.shift_id) ?? []),
      punch,
    ]);
  }

  const evidenceEnd = new Date(
    isLiveDay ? Math.min(currentMs, toMs) : toMs,
  ).toISOString();
  const roster = rosterProfiles.map((profile) => {
    const employeeShifts = shiftsByUser.get(profile.id) ?? [];
    const employeePunches = employeeShifts.flatMap(
      (shift) => punchesByShift.get(shift.id) ?? [],
    );
    const grossMinutes = employeeShifts.reduce(
      (total, shift) =>
        total +
        overlapMinutes(
          shift.start_time,
          shift.end_time,
          fromIso,
          evidenceEnd,
        ),
      0,
    );
    const breakMinutes = employeeShifts.reduce((total, shift) => {
      const events = punchesByShift.get(shift.id) ?? [];
      return (
        total +
        sumPairedOverlapDurations({
          events,
          startType: "break_start",
          endType: "break_end",
          windowStart: fromIso,
          windowEnd: evidenceEnd,
        })
      );
    }, 0);
    const lunchMinutes = employeeShifts.reduce((total, shift) => {
      const events = punchesByShift.get(shift.id) ?? [];
      return (
        total +
        sumPairedOverlapDurations({
          events,
          startType: "lunch_start",
          endType: "lunch_end",
          windowStart: fromIso,
          windowEnd: evidenceEnd,
        })
      );
    }, 0);
    const activity = activityByUser.get(profile.id);
    return {
      userId: profile.id,
      employeeName: employeeNameFromProfile(profile),
      employeeEmail: profile.email?.trim() || null,
      role: profile.role,
      shiftCount: employeeShifts.length,
      grossMinutes,
      breakMinutes,
      lunchMinutes,
      recordedMinutes: Math.max(
        0,
        grossMinutes - breakMinutes - lunchMinutes,
      ),
      jobMinutes: activity?.today.jobMinutes ?? 0,
      punchCount: employeePunches.length,
      status: activityLabel(activity?.operationalState),
    };
  });

  const billableMinutes = activities.reduce(
    (total, activity) => total + activity.today.jobMinutes,
    0,
  );
  const recordedMinutes = activities.reduce(
    (total, activity) =>
      total +
      Math.max(
        0,
        activity.today.shiftMinutes -
          activity.today.breakMinutes -
          activity.today.lunchMinutes,
      ),
    0,
  );
  const activitySummary = {
    activeTechnicians: activities.filter(
      (activity) =>
        activity.operationalState !== "off_shift" &&
        activity.operationalState !== "shift_ended",
    ).length,
    workingOnJobs: activities.filter(
      (activity) => activity.operationalState === "working_on_job",
    ).length,
    idleTechnicians: activities.filter(
      (activity) => activity.operationalState === "clocked_in_idle",
    ).length,
    onBreak: activities.filter(
      (activity) => activity.operationalState === "on_break",
    ).length,
    onLunch: activities.filter(
      (activity) => activity.operationalState === "on_lunch",
    ).length,
    endedToday: activities.filter(
      (activity) => activity.operationalState === "shift_ended",
    ).length,
    jobMinutesToday: billableMinutes,
    soldLaborHoursToday: activities.reduce(
      (total, activity) => total + activity.today.soldLaborHours,
      0,
    ),
    utilizationPct:
      recordedMinutes > 0
        ? Math.round((billableMinutes / recordedMinutes) * 100)
        : 0,
    activeExceptionCount: activities.reduce(
      (total, activity) => total + activity.exceptions.length,
      0,
    ),
  };

  return NextResponse.json({
    shifts: attendanceShifts,
    punches,
    roster,
    isLiveDay,
    billableMinutes,
    activity: {
      ...rawActivity,
      activities,
      feed: activityFeed,
      summary: activitySummary,
    },
    activities,
    activityFeed,
    activitySummary,
    sourceMap: rawActivity.sourceMap,
  });
}

export async function POST() {
  return NextResponse.json(
    { error: "Shift lifecycle writes must use the canonical shift API." },
    { status: 410 },
  );
}
