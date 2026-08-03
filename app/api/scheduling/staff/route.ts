import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getShopDayRange } from "@/features/shared/lib/utils/shopDayWindow";
import { buildWorkforceActivity } from "@/features/workforce/server/buildWorkforceActivity";
import {
  getShopScheduleDateContext,
  resolveWorkforceSchedulePosture,
} from "@/features/workforce/lib/schedulePosture";
import {
  composeActiveWorkforceRoster,
  workforceDisplayName,
} from "@/features/workforce/lib/roster";
type AdminClient = ReturnType<typeof createAdminSupabase>;
const INACTIVE_LINE_STATUSES = new Set([
  "completed",
  "cancelled",
  "closed",
  "invoiced",
  "declined",
  "voided",
]);

export async function GET(req: NextRequest) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  const admin: AdminClient = createAdminSupabase();
  const now = new Date();
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? now.toISOString();
  const to = url.searchParams.get("to") ?? new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (
    !Number.isFinite(fromDate.getTime()) ||
    !Number.isFinite(toDate.getTime()) ||
    toDate <= fromDate
  ) {
    return NextResponse.json({ error: "Invalid scheduling date range" }, { status: 400 });
  }
  const fromIso = fromDate.toISOString();
  const toIso = toDate.toISOString();
  const shopRes = await admin.from("shops").select("timezone").eq("id", access.profile.shop_id).maybeSingle();
  if (shopRes.error) return NextResponse.json({ error: shopRes.error.message }, { status: 500 });
  const todayBounds = getShopDayRange(shopRes.data?.timezone, now);
  const fromDateKey = getShopScheduleDateContext(fromDate, shopRes.data?.timezone).dateKey;
  const toDateKey = getShopScheduleDateContext(
    new Date(toDate.getTime() - 1),
    shopRes.data?.timezone,
  ).dateKey;

  const [profilesRes, workforceRes, templatesRes, overridesRes, blocksRes, requestsRes, activeLinesRes] = await Promise.all([
    admin.from("profiles").select("id, full_name, username, email, role").eq("shop_id", access.profile.shop_id).order("full_name", { ascending: true }),
    admin.from("people_workforce_profiles").select("user_id, employment_status").eq("shop_id", access.profile.shop_id),
    admin.from("staff_schedule_templates").select("*").eq("shop_id", access.profile.shop_id),
    admin.from("staff_schedule_overrides").select("*").eq("shop_id", access.profile.shop_id).gte("schedule_date", fromDateKey).lte("schedule_date", toDateKey),
    admin.from("staff_availability_blocks").select("*").eq("shop_id", access.profile.shop_id).lt("starts_at", toIso).gt("ends_at", fromIso),
    admin.from("staff_time_off_requests").select("*").eq("shop_id", access.profile.shop_id).eq("status", "pending").order("created_at", { ascending: true }).limit(50),
    admin
      .from("work_order_lines")
      .select("id, assigned_tech_id, status, line_status, voided_at")
      .eq("shop_id", access.profile.shop_id)
      .is("voided_at", null),
  ]);

  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  if (workforceRes.error) return NextResponse.json({ error: workforceRes.error.message }, { status: 500 });
  if (templatesRes.error) return NextResponse.json({ error: templatesRes.error.message }, { status: 500 });
  if (overridesRes.error) return NextResponse.json({ error: overridesRes.error.message }, { status: 500 });
  if (blocksRes.error) return NextResponse.json({ error: blocksRes.error.message }, { status: 500 });
  if (requestsRes.error) return NextResponse.json({ error: requestsRes.error.message }, { status: 500 });
  if (activeLinesRes.error) return NextResponse.json({ error: activeLinesRes.error.message }, { status: 500 });

  const activeLines = (activeLinesRes.data ?? []).filter(
    (line) =>
      !INACTIVE_LINE_STATUSES.has(
        String(line.line_status || line.status || "").toLowerCase(),
      ),
  );
  const activeLineIds = activeLines.map((line) => line.id);
  const { data: additionalAssignments, error: assignmentError } =
    activeLineIds.length > 0
      ? await admin
          .from("work_order_line_technicians")
          .select("work_order_line_id, technician_id")
          .in("work_order_line_id", activeLineIds)
      : { data: [], error: null };
  if (assignmentError) {
    return NextResponse.json(
      { error: assignmentError.message },
      { status: 500 },
    );
  }

  const activity = await buildWorkforceActivity({
    shopId: access.profile.shop_id!,
    timezone: shopRes.data?.timezone ?? null,
    now,
  });
  const activityByUser = new Map(activity.activities.map((row) => [row.userId, row]));

  const templates = templatesRes.data ?? [];
  const overrides = overridesRes.data ?? [];
  const blocks = blocksRes.data ?? [];
  const activeIds = new Set(
    composeActiveWorkforceRoster({
      profiles: profilesRes.data ?? [],
      workforceProfiles: workforceRes.data ?? [],
    }).map((person) => person.id),
  );
  const activeProfiles = (profilesRes.data ?? []).filter((profile) =>
    activeIds.has(profile.id),
  );
  const profileById = new Map(activeProfiles.map((profile) => [profile.id, profile]));
  const assignedUsersByLine = new Map<string, Set<string>>();
  for (const line of activeLines) {
    assignedUsersByLine.set(
      line.id,
      new Set(line.assigned_tech_id ? [line.assigned_tech_id] : []),
    );
  }
  for (const assignment of additionalAssignments ?? []) {
    assignedUsersByLine
      .get(assignment.work_order_line_id)
      ?.add(assignment.technician_id);
  }
  const activeWorkByUser = new Map<string, number>();
  for (const assignedUsers of assignedUsersByLine.values()) {
    for (const assignedUserId of assignedUsers) {
      activeWorkByUser.set(
        assignedUserId,
        (activeWorkByUser.get(assignedUserId) ?? 0) + 1,
      );
    }
  }

  const staff = activeProfiles.map((p) => {
    const personTemplates = templates.filter((t) => t.user_id === p.id);
    const personOverrides = overrides.filter((o) => o.user_id === p.id && o.status !== "cancelled");
    const personBlocks = blocks.filter((b) => b.user_id === p.id);

    let recurringMinutes = 0;
    for (const row of personTemplates) {
      if (!row.is_working_day || !row.start_time || !row.end_time) continue;
      const [sh, sm] = String(row.start_time).split(":").map(Number);
      const [eh, em] = String(row.end_time).split(":").map(Number);
      recurringMinutes += Math.max(0, (eh * 60 + em) - (sh * 60 + sm) - (row.unpaid_break_minutes ?? 0));
    }

    const isAwayToday = personBlocks.some((b) => b.starts_at < todayBounds.end && b.ends_at > todayBounds.start);
    const tomorrowStart = new Date(todayBounds.end);
    const tomorrowEnd = new Date(
      getShopDayRange(shopRes.data?.timezone, tomorrowStart).end,
    );
    const isAwayTomorrow = personBlocks.some((b) => new Date(b.starts_at) < tomorrowEnd && new Date(b.ends_at) > tomorrowStart);
    const todaySchedule = resolveWorkforceSchedulePosture({
      userId: p.id,
      at: now,
      timezone: shopRes.data?.timezone,
      templates,
      overrides,
    });
    const tomorrowSchedule = resolveWorkforceSchedulePosture({
      userId: p.id,
      at: new Date(new Date(todayBounds.end).getTime() + 12 * 60 * 60 * 1000),
      timezone: shopRes.data?.timezone,
      templates,
      overrides,
    });
    const liveActivity = activityByUser.get(p.id);

    return {
      ...p,
      display_name: workforceDisplayName(p),
      recurring_template_rows: personTemplates.length,
      weekly_recurring_minutes: recurringMinutes,
      override_count_in_range: personOverrides.length,
      approved_away_blocks_in_range: personBlocks.length,
      is_away_today: isAwayToday,
      is_away_tomorrow: isAwayTomorrow,
      is_scheduled_today: todaySchedule.scheduled,
      is_scheduled_tomorrow: tomorrowSchedule.scheduled,
      schedule_source_today: todaySchedule.source,
      live_state: liveActivity?.operationalState ?? "off_shift",
      is_clocked_in: Boolean(
        liveActivity &&
          liveActivity.operationalState !== "off_shift" &&
          liveActivity.operationalState !== "shift_ended",
      ),
      current_job: liveActivity?.currentJob
        ? {
            work_order_number: liveActivity.currentJob.workOrderNumber,
            line_description: liveActivity.currentJob.lineDescription,
          }
        : null,
      active_assigned_work_count: activeWorkByUser.get(p.id) ?? 0,
      next_override: personOverrides
        .slice()
        .sort((a, b) => String(a.schedule_date).localeCompare(String(b.schedule_date)))[0] ?? null,
    };
  });

  const pendingRequests = (requestsRes.data ?? []).map((request) => {
    const employee = profileById.get(request.user_id);
    const requestStart = new Date(request.starts_at);
    const requestEnd = new Date(request.ends_at);
    const requestStartKey = getShopScheduleDateContext(
      requestStart,
      shopRes.data?.timezone,
    ).dateKey;
    const requestEndKey = getShopScheduleDateContext(
      new Date(Math.max(requestStart.getTime(), requestEnd.getTime() - 1)),
      shopRes.data?.timezone,
    ).dateKey;
    const dayKeys: string[] = [];
    for (
      let cursor = new Date(`${requestStartKey}T12:00:00.000Z`);
      cursor <= new Date(`${requestEndKey}T12:00:00.000Z`);
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      dayKeys.push(cursor.toISOString().slice(0, 10));
    }
    let scheduledMinutesAffected = 0;
    const personOverrides = overrides.filter(
      (row) =>
        row.user_id === request.user_id &&
        dayKeys.includes(row.schedule_date),
    );
    const personTemplates = templates.filter(
      (row) => row.user_id === request.user_id && row.is_working_day,
    );
    for (const dayKey of dayKeys) {
      const override = personOverrides.find(
        (row) => row.schedule_date === dayKey,
      );
      if (override) {
        if (override.status !== "scheduled") continue;
        const row = override;
        if (!row.start_time || !row.end_time) continue;
        scheduledMinutesAffected += Math.max(0, Math.round((new Date(row.end_time).getTime() - new Date(row.start_time).getTime()) / 60000) - Number(row.unpaid_break_minutes ?? 0));
        continue;
      }
      const day = new Date(`${dayKey}T12:00:00.000Z`).getUTCDay();
      const row = personTemplates.find(
        (template) =>
          template.day_of_week === day &&
          (!template.effective_from || template.effective_from <= dayKey) &&
          (!template.effective_to || template.effective_to >= dayKey),
      );
      if (!row?.start_time || !row.end_time) continue;
      const [sh, sm] = String(row.start_time).split(":").map(Number);
      const [eh, em] = String(row.end_time).split(":").map(Number);
      scheduledMinutesAffected += Math.max(
        0,
        eh * 60 +
          em -
          (sh * 60 + sm) -
          Number(row.unpaid_break_minutes ?? 0),
      );
    }
    const overlappingApproved = blocks.filter((block) =>
      block.user_id !== request.user_id &&
      new Date(block.starts_at) < requestEnd &&
      new Date(block.ends_at) > requestStart
    ).length;
    return {
      ...request,
      employee_name: workforceDisplayName(employee),
      employee_role: employee?.role ?? null,
      scheduled_minutes_affected: scheduledMinutesAffected,
      overlapping_approved_absences: overlappingApproved,
      active_assigned_work_count: activeWorkByUser.get(request.user_id) ?? 0,
    };
  });

  return NextResponse.json({
    timezone: shopRes.data?.timezone ?? "UTC",
    staff,
    templates,
    overrides,
    availability_blocks: blocks,
    pending_time_off_requests: pendingRequests,
  });
}
