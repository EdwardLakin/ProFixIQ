import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  isValidScheduleDateKey,
  normalizeScheduleClockTime,
  normalizeUnpaidBreakMinutes,
  scheduleClockMinutes,
} from "@/features/workforce/lib/scheduleValidation";

type Ctx = { params: Promise<{ id: string }> };
type AdminClient = ReturnType<typeof createAdminSupabase>;

async function checkStaffInShop(admin: AdminClient, shopId: string, userId: string) {
  const { data, error } = await admin.from("profiles").select("id, shop_id, full_name, username, email, role").eq("id", userId).maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 } as const;
  if (!data || data.shop_id !== shopId) return { ok: false, error: "Staff not found", status: 404 } as const;
  return { ok: true, profile: data } as const;
}

export async function GET(_req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  const admin: AdminClient = createAdminSupabase();
  const check = await checkStaffInShop(admin, access.profile.shop_id!, id);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const [
    { data: templates, error: templatesError },
    { data: overrides, error: overridesError },
    { data: blocks, error: blocksError },
    { data: requests, error: requestsError },
  ] = await Promise.all([
    admin.from("staff_schedule_templates").select("*").eq("shop_id", access.profile.shop_id).eq("user_id", id).order("day_of_week", { ascending: true }),
    admin.from("staff_schedule_overrides").select("*").eq("shop_id", access.profile.shop_id).eq("user_id", id).order("schedule_date", { ascending: true }).limit(60),
    admin.from("staff_availability_blocks").select("*").eq("shop_id", access.profile.shop_id).eq("user_id", id).order("starts_at", { ascending: true }).limit(60),
    admin.from("staff_time_off_requests").select("*").eq("shop_id", access.profile.shop_id).eq("user_id", id).order("created_at", { ascending: false }).limit(60),
  ]);
  const loadError =
    templatesError ?? overridesError ?? blocksError ?? requestsError;
  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }

  return NextResponse.json({ person: check.profile, templates: templates ?? [], overrides: overrides ?? [], availability_blocks: blocks ?? [], time_off_requests: requests ?? [] });
}

export async function PUT(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null) as null | {
    templates?: Array<{
      day_of_week: number;
      is_working_day?: boolean;
      start_time?: string | null;
      end_time?: string | null;
      unpaid_break_minutes?: number | null;
      effective_from?: string | null;
      effective_to?: string | null;
    }>;
  };

  if (!body?.templates || !Array.isArray(body.templates)) {
    return NextResponse.json({ error: "templates[] required" }, { status: 400 });
  }

  const admin: AdminClient = createAdminSupabase();
  const check = await checkStaffInShop(admin, access.profile.shop_id!, id);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  if (body.templates.length > 7) {
    return NextResponse.json(
      { error: "A recurring schedule can contain at most one row per weekday." },
      { status: 400 },
    );
  }

  const normalized = [];
  const seenDays = new Set<number>();
  for (const row of body.templates) {
    if (
      !Number.isInteger(row.day_of_week) ||
      row.day_of_week < 0 ||
      row.day_of_week > 6
    ) {
      return NextResponse.json(
        { error: "Each schedule row must use a weekday from 0 through 6." },
        { status: 400 },
      );
    }
    if (seenDays.has(row.day_of_week)) {
      return NextResponse.json(
        { error: "Each weekday can appear only once." },
        { status: 400 },
      );
    }
    seenDays.add(row.day_of_week);

    const isWorkingDay = row.is_working_day ?? true;
    const startTime = normalizeScheduleClockTime(row.start_time);
    const endTime = normalizeScheduleClockTime(row.end_time);
    const unpaidBreakMinutes = normalizeUnpaidBreakMinutes(
      row.unpaid_break_minutes,
    );
    if (
      startTime === undefined ||
      endTime === undefined ||
      unpaidBreakMinutes === undefined
    ) {
      return NextResponse.json(
        { error: "Schedule times or unpaid break minutes are invalid." },
        { status: 400 },
      );
    }
    if (isWorkingDay && (!startTime || !endTime)) {
      return NextResponse.json(
        { error: "Working days require both a start and end time." },
        { status: 400 },
      );
    }
    if (
      isWorkingDay &&
      startTime &&
      endTime &&
      scheduleClockMinutes(endTime) <= scheduleClockMinutes(startTime)
    ) {
      return NextResponse.json(
        { error: "Schedule end must be after start on the same day." },
        { status: 400 },
      );
    }
    if (
      row.effective_from &&
      !isValidScheduleDateKey(row.effective_from)
    ) {
      return NextResponse.json(
        { error: "Invalid recurring schedule start date." },
        { status: 400 },
      );
    }
    if (row.effective_to && !isValidScheduleDateKey(row.effective_to)) {
      return NextResponse.json(
        { error: "Invalid recurring schedule end date." },
        { status: 400 },
      );
    }
    if (
      row.effective_from &&
      row.effective_to &&
      row.effective_to < row.effective_from
    ) {
      return NextResponse.json(
        { error: "Recurring schedule end date must not precede its start date." },
        { status: 400 },
      );
    }

    normalized.push({
      shop_id: access.profile.shop_id,
      user_id: id,
      day_of_week: row.day_of_week,
      is_working_day: isWorkingDay,
      start_time: isWorkingDay ? startTime : null,
      end_time: isWorkingDay ? endTime : null,
      unpaid_break_minutes: isWorkingDay ? unpaidBreakMinutes : 0,
      effective_from: row.effective_from ?? null,
      effective_to: row.effective_to ?? null,
    });
  }

  const { error } = await (admin as any).rpc("replace_staff_schedule_template", {
    p_shop_id: access.profile.shop_id,
    p_actor_profile_id: access.profile.id,
    p_target_user_id: id,
    p_templates: normalized,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, templates: normalized });
}
