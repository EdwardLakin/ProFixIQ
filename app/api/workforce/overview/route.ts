import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getShopTodayTomorrowRanges } from "@/features/shared/lib/utils/shopDayWindow";
import { buildWorkforceActivity } from "@/features/workforce/server/buildWorkforceActivity";
import {
  getShopScheduleDateContext,
  resolveWorkforceSchedulePosture,
} from "@/features/workforce/lib/schedulePosture";
import {
  composeActiveWorkforceRoster,
  workforceDisplayName,
} from "@/features/workforce/lib/roster";
import { addScheduleDateKeyDays } from "@/features/workforce/lib/scheduleValidation";

type AdminClient = ReturnType<typeof createAdminSupabase>;
type Severity = "blocking" | "warning" | "info";
type WorkforceInboxItem = { id: string; type: string; severity: Severity; title: string; description: string; count?: number; personId?: string; personName?: string; href: string; createdAt?: string };
type WorkforceOverviewResponse = {
  summary: {
    workingToday: number;
    scheduledToday: number;
    activeStaff: number;
    awayToday: number;
    awayTomorrow: number;
    pendingTimeOff: number;
    payrollBlocking: number;
    payrollWarnings: number;
    expiringCertifications: number;
    expiredCertifications: number;
    scheduleGaps: number;
    unassignedJobs: number;
    assignedToUnavailable: number;
    overloadedTechs: number;
    workingOnJobs: number;
    idleTechnicians: number;
    activeAttendanceExceptions: number;
  };
  inbox: WorkforceInboxItem[];
  sections: Record<string, WorkforceInboxItem[]>;
  generatedAt: string;
  permissions: {
    canAccessPeople: boolean;
  };
};
const ACTIVE_LINE_EXCLUDED = [
  "completed",
  "cancelled",
  "closed",
  "invoiced",
  "declined",
  "voided",
];
const OVERLOAD_THRESHOLD = 6;
const OVERLOADED_INBOX_CAP = 10;
const INBOX_MAX_ITEMS = 25;
const TYPE_PRIORITY: Record<string, number> = {
  payroll_blocking: 0,
  assigned_to_unavailable: 1,
  cert_expired: 2,
  pending_time_off: 3,
  payroll_warning: 4,
  cert_expiring: 5,
  schedule_gaps: 6,
  unassigned_jobs: 7,
  overloaded_tech: 8,
  away_today: 9,
  away_tomorrow: 10,
  info: 11,
};

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin", "manager"] });
  if (!access.ok) return access.response;
  const canAccessPeople = access.profile.role === "owner" || access.profile.role === "admin";
  const admin: AdminClient = createAdminSupabase();
  const shopId = access.profile.shop_id!;
  const now = new Date();
  const shopRes = await admin.from("shops").select("timezone").eq("id", shopId).maybeSingle();
  if (shopRes.error) return NextResponse.json({ error: shopRes.error.message }, { status: 500 });
  // Workforce day views intentionally use shop-local timezone day boundaries.
  const dayRanges = getShopTodayTomorrowRanges(shopRes.data?.timezone, now);
  const todayStartIso = dayRanges.today.start;
  const todayEndIso = dayRanges.today.end;
  const tomorrowEndIso = dayRanges.tomorrow.end;
  const todayDateKey = getShopScheduleDateContext(
    now,
    shopRes.data?.timezone,
  ).dateKey;
  const certificationHorizonDateKey = addScheduleDateKeyDays(
    todayDateKey,
    30,
  );

  const [activity, profilesRes, workforceRes, timeOffRes, periodsRes, certsRes, templatesRes, overridesRes, blocksRes, linesRes] = await Promise.all([
    buildWorkforceActivity({ shopId, timezone: shopRes.data?.timezone ?? null }),
    admin
      .from("profiles")
      .select("id, full_name, username, email, role")
      .eq("shop_id", shopId),
    admin.from("people_workforce_profiles").select("user_id, employment_status").eq("shop_id", shopId),
    admin.from("staff_time_off_requests").select("id, created_at").eq("shop_id", shopId).eq("status", "pending").order("created_at", { ascending: true }),
    admin.from("payroll_pay_periods").select("id, period_start").eq("shop_id", shopId).order("period_start", { ascending: false }).limit(1),
    admin.from("staff_certifications").select("user_id, expiry_date, status").eq("shop_id", shopId),
    admin.from("staff_schedule_templates").select("user_id, day_of_week, is_working_day, start_time, end_time, effective_from, effective_to").eq("shop_id", shopId),
    admin.from("staff_schedule_overrides").select("user_id, schedule_date, start_time, end_time, status").eq("shop_id", shopId).eq("schedule_date", todayDateKey),
    admin.from("staff_availability_blocks").select("user_id, starts_at, ends_at").eq("shop_id", shopId).lte("starts_at", tomorrowEndIso).gte("ends_at", todayStartIso),
    admin.from("work_order_lines").select("id, assigned_tech_id, line_status, status, voided_at").eq("shop_id", shopId).is("voided_at", null),
  ]);
  const firstError = [profilesRes, workforceRes, timeOffRes, periodsRes, certsRes, templatesRes, overridesRes, blocksRes, linesRes].find((r) => r.error);
  if (firstError?.error) return NextResponse.json({ error: firstError.error.message }, { status: 500 });
  const activeLineIds = (linesRes.data ?? [])
    .filter((l) => !ACTIVE_LINE_EXCLUDED.includes((l.line_status || l.status || "").toLowerCase()))
    .map((l) => l.id);
  // Two-step scope: technician assignments are constrained by already shop-scoped line IDs to prevent cross-tenant leakage.
  const lineTechRes = activeLineIds.length > 0
    ? await admin.from("work_order_line_technicians").select("work_order_line_id, technician_id").in("work_order_line_id", activeLineIds)
    : { data: [], error: null };
  if (lineTechRes.error) return NextResponse.json({ error: lineTechRes.error.message }, { status: 500 });

  const profileName = new Map(
    (profilesRes.data ?? []).map((profile) => [
      profile.id,
      workforceDisplayName(profile),
    ]),
  );
  const activeRoster = composeActiveWorkforceRoster({
    profiles: profilesRes.data ?? [],
    workforceProfiles: workforceRes.data ?? [],
  });
  const activeStaff = new Set(activeRoster.map((person) => person.id));
  const templateUsers = new Set((templatesRes.data ?? []).map((t) => t.user_id));
  const scheduledToday = [...activeStaff].filter((userId) =>
    resolveWorkforceSchedulePosture({
      userId,
      at: now,
      timezone: shopRes.data?.timezone,
      templates: templatesRes.data ?? [],
      overrides: overridesRes.data ?? [],
    }).scheduled,
  ).length;
  const blocks = blocksRes.data ?? [];
  const overlap = (start: string, end: string, from: Date, to: Date) => new Date(start) < to && new Date(end) > from;
  const awayTodayUsers = new Set(
    blocks
      .filter(
        (block) =>
          activeStaff.has(block.user_id) &&
          overlap(
            block.starts_at,
            block.ends_at,
            new Date(todayStartIso),
            new Date(todayEndIso),
          ),
      )
      .map((block) => block.user_id),
  );
  const awayTomorrowUsers = new Set(
    blocks
      .filter(
        (block) =>
          activeStaff.has(block.user_id) &&
          overlap(
            block.starts_at,
            block.ends_at,
            new Date(todayEndIso),
            new Date(tomorrowEndIso),
          ),
      )
      .map((block) => block.user_id),
  );

  let payrollBlocking = 0; let payrollWarnings = 0;
  const periodId = periodsRes.data?.[0]?.id;
  if (periodId) {
    const exRes = await admin.from("payroll_time_exceptions").select("severity").eq("shop_id", shopId).eq("period_id", periodId).eq("resolved", false);
    if (exRes.error) return NextResponse.json({ error: exRes.error.message }, { status: 500 });
    for (const ex of exRes.data ?? []) { if (ex.severity === "blocking") payrollBlocking += 1; if (ex.severity === "warning") payrollWarnings += 1; }
  }

  let expiredCertifications = 0; let expiringCertifications = 0;
  for (const cert of (certsRes.data ?? []).filter((row) =>
    activeStaff.has(row.user_id),
  )) {
    const expiryDateKey =
      typeof cert.expiry_date === "string"
        ? cert.expiry_date.slice(0, 10)
        : null;
    if (
      cert.status === "expired" ||
      (expiryDateKey && expiryDateKey < todayDateKey)
    ) {
      expiredCertifications += 1;
    } else if (
      expiryDateKey &&
      expiryDateKey >= todayDateKey &&
      expiryDateKey <= certificationHorizonDateKey
    ) {
      expiringCertifications += 1;
    }
  }

  const lineTechMap = new Map<string, string[]>();
  for (const row of lineTechRes.data ?? []) lineTechMap.set(row.work_order_line_id, [...(lineTechMap.get(row.work_order_line_id) ?? []), row.technician_id]);

  const activeLines = (linesRes.data ?? []).filter((l) => !ACTIVE_LINE_EXCLUDED.includes((l.line_status || l.status || "").toLowerCase()));
  let unassignedJobs = 0; let assignedToUnavailable = 0;
  const loadByTech = new Map<string, number>();
  for (const line of activeLines) {
    const assigned = new Set<string>([...(line.assigned_tech_id ? [line.assigned_tech_id] : []), ...(lineTechMap.get(line.id) ?? [])]);
    if (assigned.size === 0) unassignedJobs += 1;
    let lineHasUnavailableAssignee = false;
    for (const tech of assigned) {
      loadByTech.set(tech, (loadByTech.get(tech) ?? 0) + 1);
      if (!activeStaff.has(tech) || awayTodayUsers.has(tech)) {
        lineHasUnavailableAssignee = true;
      }
    }
    if (lineHasUnavailableAssignee) assignedToUnavailable += 1;
  }
  const overloaded = [...loadByTech.entries()]
    .filter(([, count]) => count >= OVERLOAD_THRESHOLD)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const pendingTimeOff = (timeOffRes.data ?? []).length;
  const scheduleGaps = [...activeStaff].filter((id) => !templateUsers.has(id)).length;

  const sections: Record<string, WorkforceInboxItem[]> = { timeOff: [], payroll: [], certifications: [], scheduling: [], operations: [] };
  const add = (section: keyof typeof sections, item: WorkforceInboxItem) => sections[section].push(item);
  if (pendingTimeOff > 0) add("timeOff", { id: "timeoff-pending", type: "pending_time_off", severity: "warning", title: "Pending time-off approvals", description: `${pendingTimeOff} request${pendingTimeOff > 1 ? "s" : ""} awaiting review.`, count: pendingTimeOff, href: "/dashboard/workforce/scheduling?focus=time-off&status=pending", createdAt: timeOffRes.data?.[0]?.created_at ?? undefined });
  if (payrollBlocking > 0) add("payroll", { id: "payroll-blocking", type: "payroll_blocking", severity: "blocking", title: "Payroll blocking exceptions", description: `${payrollBlocking} blocking exception${payrollBlocking > 1 ? "s" : ""} in active period.`, count: payrollBlocking, href: "/dashboard/workforce/payroll-review?severity=blocking" });
  if (payrollWarnings > 0) add("payroll", { id: "payroll-warnings", type: "payroll_warning", severity: "warning", title: "Payroll warnings", description: `${payrollWarnings} warning exception${payrollWarnings > 1 ? "s" : ""} in active period.`, count: payrollWarnings, href: "/dashboard/workforce/payroll-review?severity=warning" });
  if (expiredCertifications > 0) add("certifications", { id: "cert-expired", type: "cert_expired", severity: "blocking", title: "Expired certifications", description: `${expiredCertifications} certification${expiredCertifications > 1 ? "s are" : " is"} expired.`, count: expiredCertifications, href: "/dashboard/workforce/certifications#expired" });
  if (expiringCertifications > 0) add("certifications", { id: "cert-expiring", type: "cert_expiring", severity: "warning", title: "Certifications expiring soon", description: `${expiringCertifications} certification${expiringCertifications > 1 ? "s" : ""} expiring in 30 days.`, count: expiringCertifications, href: "/dashboard/workforce/certifications#expiring-soon" });
  if (scheduleGaps > 0) add("scheduling", { id: "schedule-gaps", type: "schedule_gaps", severity: "warning", title: "Missing recurring schedule templates", description: `${scheduleGaps} active staff member${scheduleGaps > 1 ? "s" : ""} without a template.`, count: scheduleGaps, href: canAccessPeople ? "/dashboard/workforce/people?action=missing_schedule_template" : "/dashboard/workforce/scheduling?focus=schedule-gaps" });
  if (unassignedJobs > 0) add("operations", {
    id: "unassigned-jobs", type: "unassigned_jobs", severity: "warning", title: "Unassigned active jobs", description: `${unassignedJobs} active job line${unassignedJobs > 1 ? "s" : ""} without technician assignment.`, count: unassignedJobs, href: "/work-orders/view?assignment=unassigned&status=active&source=workforce",
  });
  if (assignedToUnavailable > 0) add("operations", { id: "jobs-unavailable-tech", type: "assigned_to_unavailable", severity: "blocking", title: "Jobs assigned to unavailable techs", description: `${assignedToUnavailable} active assignment${assignedToUnavailable > 1 ? "s" : ""} conflict with the active roster or approved time away.`, count: assignedToUnavailable, href: "/dashboard/workforce/scheduling?focus=conflicts&type=assigned_to_unavailable" });
  if (activity.summary.activeExceptionCount > 0) add("operations", { id: "attendance-active-exceptions", type: "attendance_exceptions", severity: "blocking", title: "Live attendance exceptions", description: `${activity.summary.activeExceptionCount} active shop-floor exception${activity.summary.activeExceptionCount > 1 ? "s" : ""} need review.`, count: activity.summary.activeExceptionCount, href: "/dashboard/workforce/attendance?filter=exceptions" });
  for (const [personId, count] of overloaded.slice(0, OVERLOADED_INBOX_CAP)) add("operations", { id: `overloaded-${personId}`, type: "overloaded_tech", severity: "warning", title: "Technician workload is high", description: `${profileName.get(personId) ?? "A technician"} has ${count} active assigned jobs.`, count, personId, personName: profileName.get(personId) ?? undefined, href: canAccessPeople ? `/dashboard/workforce/people/${personId}?focus=workload&from=workforce-overview` : `/dashboard/workforce/scheduling?focus=workload&person_id=${personId}` });

  const severityOrder: Record<Severity, number> = { blocking: 0, warning: 1, info: 2 };
  const typePriority = (type: string) => TYPE_PRIORITY[type] ?? Number.MAX_SAFE_INTEGER;
  const inbox = Object.values(sections)
    .flat()
    .sort((a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity]
      || typePriority(a.type) - typePriority(b.type)
      || ((a.createdAt && b.createdAt) ? (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) : 0)
      || a.type.localeCompare(b.type)
      || a.id.localeCompare(b.id),
    )
    .slice(0, INBOX_MAX_ITEMS);

  const response: WorkforceOverviewResponse = {
    summary: {
      workingToday: activity.summary.activeTechnicians,
      scheduledToday,
      activeStaff: activeStaff.size,
      awayToday: awayTodayUsers.size,
      awayTomorrow: awayTomorrowUsers.size,
      pendingTimeOff,
      payrollBlocking,
      payrollWarnings,
      expiringCertifications,
      expiredCertifications,
      scheduleGaps,
      unassignedJobs,
      assignedToUnavailable,
      overloadedTechs: overloaded.length,
      workingOnJobs: activity.summary.workingOnJobs,
      idleTechnicians: activity.summary.idleTechnicians,
      activeAttendanceExceptions: activity.summary.activeExceptionCount,
    },
    inbox,
    sections,
    generatedAt: new Date().toISOString(),
    permissions: {
      canAccessPeople,
    },
  };

  return NextResponse.json(response);
}
