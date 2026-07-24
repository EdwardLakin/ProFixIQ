import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { getShopDayRange } from "@/features/shared/lib/utils/shopDayWindow";
type AdminClient = ReturnType<typeof createAdminSupabase>;

export async function GET(req: NextRequest) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const actor = getActorCapabilities({ role: access.profile.role });
  if (!actor.canManageScheduling) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin: AdminClient = createAdminSupabase();
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString();
  const to = url.searchParams.get("to") ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const shopRes = await admin.from("shops").select("timezone").eq("id", access.profile.shop_id).maybeSingle();
  if (shopRes.error) return NextResponse.json({ error: shopRes.error.message }, { status: 500 });
  const todayBounds = getShopDayRange(shopRes.data?.timezone, new Date());

  const [profilesRes, workforceRes, templatesRes, overridesRes, blocksRes, requestsRes, activeLinesRes] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, role").eq("shop_id", access.profile.shop_id).order("full_name", { ascending: true }),
    admin.from("people_workforce_profiles").select("user_id, employment_status").eq("shop_id", access.profile.shop_id),
    admin.from("staff_schedule_templates").select("*").eq("shop_id", access.profile.shop_id),
    admin.from("staff_schedule_overrides").select("*").eq("shop_id", access.profile.shop_id).gte("schedule_date", from.slice(0, 10)).lte("schedule_date", to.slice(0, 10)),
    admin.from("staff_availability_blocks").select("*").eq("shop_id", access.profile.shop_id).lte("starts_at", to).gte("ends_at", from),
    admin.from("staff_time_off_requests").select("*").eq("shop_id", access.profile.shop_id).eq("status", "pending").order("created_at", { ascending: true }).limit(50),
    admin.from("work_order_lines").select("id, assigned_tech_id, status").eq("shop_id", access.profile.shop_id).not("assigned_tech_id", "is", null).not("status", "in", '("completed","invoiced","cancelled","declined")'),
  ]);

  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  if (workforceRes.error) return NextResponse.json({ error: workforceRes.error.message }, { status: 500 });
  if (templatesRes.error) return NextResponse.json({ error: templatesRes.error.message }, { status: 500 });
  if (overridesRes.error) return NextResponse.json({ error: overridesRes.error.message }, { status: 500 });
  if (blocksRes.error) return NextResponse.json({ error: blocksRes.error.message }, { status: 500 });
  if (requestsRes.error) return NextResponse.json({ error: requestsRes.error.message }, { status: 500 });

  const templates = templatesRes.data ?? [];
  const overrides = overridesRes.data ?? [];
  const blocks = blocksRes.data ?? [];
  const employmentByUser = new Map((workforceRes.data ?? []).map((row) => [row.user_id, row.employment_status]));
  const activeProfiles = (profilesRes.data ?? []).filter((profile) => {
    const status = employmentByUser.get(profile.id);
    return !status || status === "active";
  });
  const profileById = new Map(activeProfiles.map((profile) => [profile.id, profile]));
  const activeWorkByUser = new Map<string, number>();
  for (const line of activeLinesRes.data ?? []) {
    if (!line.assigned_tech_id) continue;
    activeWorkByUser.set(line.assigned_tech_id, (activeWorkByUser.get(line.assigned_tech_id) ?? 0) + 1);
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
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);
    const isAwayTomorrow = personBlocks.some((b) => new Date(b.starts_at) < tomorrowEnd && new Date(b.ends_at) > tomorrowStart);

    return {
      ...p,
      recurring_template_rows: personTemplates.length,
      weekly_recurring_minutes: recurringMinutes,
      override_count_in_range: personOverrides.length,
      approved_away_blocks_in_range: personBlocks.length,
      is_away_today: isAwayToday,
      is_away_tomorrow: isAwayTomorrow,
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
    const dayKeys: string[] = [];
    for (
      let cursor = new Date(Date.UTC(requestStart.getUTCFullYear(), requestStart.getUTCMonth(), requestStart.getUTCDate()));
      cursor <= requestEnd;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      dayKeys.push(cursor.toISOString().slice(0, 10));
    }
    let scheduledMinutesAffected = 0;
    const personOverrides = overrides.filter((row) => row.user_id === request.user_id && dayKeys.includes(row.schedule_date) && row.status === "scheduled");
    if (personOverrides.length > 0) {
      for (const row of personOverrides) {
        if (!row.start_time || !row.end_time) continue;
        scheduledMinutesAffected += Math.max(0, Math.round((new Date(row.end_time).getTime() - new Date(row.start_time).getTime()) / 60000) - Number(row.unpaid_break_minutes ?? 0));
      }
    } else {
      const personTemplates = templates.filter((row) => row.user_id === request.user_id && row.is_working_day);
      for (const dayKey of dayKeys) {
        const day = new Date(`${dayKey}T12:00:00.000Z`).getUTCDay();
        const row = personTemplates.find((template) => template.day_of_week === day);
        if (!row?.start_time || !row.end_time) continue;
        const [sh, sm] = String(row.start_time).split(":").map(Number);
        const [eh, em] = String(row.end_time).split(":").map(Number);
        scheduledMinutesAffected += Math.max(0, (eh * 60 + em) - (sh * 60 + sm) - Number(row.unpaid_break_minutes ?? 0));
      }
    }
    const overlappingApproved = blocks.filter((block) =>
      block.user_id !== request.user_id &&
      new Date(block.starts_at) < requestEnd &&
      new Date(block.ends_at) > requestStart
    ).length;
    return {
      ...request,
      employee_name: employee?.full_name ?? employee?.email ?? "Unknown employee",
      employee_role: employee?.role ?? null,
      scheduled_minutes_affected: scheduledMinutesAffected,
      overlapping_approved_absences: overlappingApproved,
      active_assigned_work_count: activeWorkByUser.get(request.user_id) ?? 0,
    };
  });

  return NextResponse.json({
    staff,
    templates,
    overrides,
    availability_blocks: blocks,
    pending_time_off_requests: pendingRequests,
  });
}
