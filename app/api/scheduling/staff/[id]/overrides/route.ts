import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { shopLocalDateTimeToUtc } from "@/features/shared/lib/utils/shopDayWindow";
import {
  isValidScheduleDateKey,
  normalizeUnpaidBreakMinutes,
} from "@/features/workforce/lib/scheduleValidation";

type Ctx = { params: Promise<{ id: string }> };
type AdminClient = ReturnType<typeof createAdminSupabase>;
type ScheduleOverrideRow = {
  id: string;
  user_id: string;
  schedule_date: string;
  start_time: string | null;
  end_time: string | null;
  unpaid_break_minutes: number;
  notes: string | null;
  status: string;
};

export async function POST(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null) as null | {
    schedule_date?: string;
    start_time?: string | null;
    end_time?: string | null;
    start_local?: string | null;
    end_local?: string | null;
    unpaid_break_minutes?: number | null;
    notes?: string | null;
  };

  if (!body?.schedule_date) return NextResponse.json({ error: "schedule_date required" }, { status: 400 });
  if (!isValidScheduleDateKey(body.schedule_date)) {
    return NextResponse.json({ error: "Choose a valid schedule date." }, { status: 400 });
  }
  if (
    body.notes !== undefined &&
    body.notes !== null &&
    typeof body.notes !== "string"
  ) {
    return NextResponse.json(
      { error: "Schedule notes must be text." },
      { status: 400 },
    );
  }
  if (typeof body.notes === "string" && body.notes.trim().length > 2000) {
    return NextResponse.json(
      { error: "Schedule notes must be 2000 characters or fewer." },
      { status: 400 },
    );
  }
  const notes =
    typeof body.notes === "string" ? body.notes.trim() || null : null;
  if (
    Boolean(body.start_local) !== Boolean(body.end_local) ||
    Boolean(body.start_time) !== Boolean(body.end_time)
  ) {
    return NextResponse.json(
      { error: "Provide both schedule start and end times, or leave both blank." },
      { status: 400 },
    );
  }
  if (
    (body.start_local || body.end_local) &&
    (body.start_time || body.end_time)
  ) {
    return NextResponse.json(
      { error: "Provide shop-local times or UTC timestamps, not both." },
      { status: 400 },
    );
  }
  const unpaidBreakMinutes = normalizeUnpaidBreakMinutes(
    body.unpaid_break_minutes,
  );
  if (unpaidBreakMinutes === undefined) {
    return NextResponse.json(
      { error: "Unpaid break minutes must be a whole number from 0 through 1440." },
      { status: 400 },
    );
  }

  const admin: AdminClient = createAdminSupabase();
  const [
    { data: shop, error: shopError },
    { data: target, error: targetError },
  ] = await Promise.all([
    admin
      .from("shops")
      .select("timezone")
      .eq("id", access.profile.shop_id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id")
      .eq("id", id)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle(),
  ]);
  if (shopError || targetError) {
    return NextResponse.json(
      { error: shopError?.message ?? targetError?.message },
      { status: 500 },
    );
  }
  if (!target) {
    return NextResponse.json(
      { error: "Employee not found in this shop." },
      { status: 404 },
    );
  }

  let startTime = body.start_time ?? null;
  let endTime = body.end_time ?? null;
  try {
    if (body.start_local) startTime = shopLocalDateTimeToUtc(body.schedule_date, body.start_local, shop?.timezone);
    if (body.end_local) endTime = shopLocalDateTimeToUtc(body.schedule_date, body.end_local, shop?.timezone);
  } catch {
    return NextResponse.json({ error: "Invalid shop-local schedule time" }, { status: 400 });
  }
  const startTimestamp = startTime ? new Date(startTime).getTime() : null;
  const endTimestamp = endTime ? new Date(endTime).getTime() : null;
  if (
    (startTimestamp !== null && !Number.isFinite(startTimestamp)) ||
    (endTimestamp !== null && !Number.isFinite(endTimestamp))
  ) {
    return NextResponse.json(
      { error: "Schedule timestamps are invalid." },
      { status: 400 },
    );
  }
  if (
    startTimestamp !== null &&
    endTimestamp !== null &&
    endTimestamp <= startTimestamp
  ) {
    return NextResponse.json({ error: "Schedule end must be after start" }, { status: 400 });
  }

  const rpc = admin.rpc as unknown as (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: ScheduleOverrideRow | null;
    error: { message: string } | null;
  }>;
  const { data, error } = await rpc("save_staff_schedule_override_atomic", {
    p_shop_id: access.profile.shop_id,
    p_actor_profile_id: access.profile.id,
    p_actor_auth_user_id: access.authUserId,
    p_override_id: null,
    p_target_user_id: id,
    p_schedule_date: body.schedule_date,
    p_start_time: startTime,
    p_end_time: endTime,
    p_unpaid_break_minutes: unpaidBreakMinutes,
    p_notes: notes,
    p_status: "scheduled",
  });
  if (error || !data) {
    const message = error?.message ?? "Schedule override was not saved.";
    const status = /not authorized|identity|member/i.test(message)
      ? 403
      : /not found/i.test(message)
        ? 404
        : /required|must be|provide both/i.test(message)
          ? 400
          : 500;
    return NextResponse.json(
      { error: message },
      { status },
    );
  }

  return NextResponse.json({ ok: true, override: data }, { status: 201 });
}
