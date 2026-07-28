import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { normalizeUnpaidBreakMinutes } from "@/features/workforce/lib/scheduleValidation";

type Ctx = { params: Promise<{ overrideId: string }> };
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

function scheduleOverrideRpc(admin: AdminClient) {
  return admin.rpc as unknown as (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: ScheduleOverrideRow | null;
    error: { message: string } | null;
  }>;
}

function scheduleOverrideErrorStatus(message: string) {
  if (/not authorized|identity|member/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/required|must be|provide both/i.test(message)) return 400;
  return 500;
}

export async function PATCH(req: NextRequest, context: Ctx) {
  const { overrideId } = await context.params;
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const allowedKeys = new Set([
    "start_time",
    "end_time",
    "status",
    "notes",
    "unpaid_break_minutes",
  ]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return NextResponse.json(
      { error: "Unsupported schedule override field." },
      { status: 400 },
    );
  }
  if (
    body.status !== undefined &&
    !["scheduled", "cancelled"].includes(String(body.status))
  ) {
    return NextResponse.json(
      { error: "Override status must be scheduled or cancelled." },
      { status: 400 },
    );
  }
  for (const field of ["start_time", "end_time"] as const) {
    if (
      body[field] !== undefined &&
      body[field] !== null &&
      typeof body[field] !== "string"
    ) {
      return NextResponse.json(
        { error: `${field.replace("_", " ")} must be an ISO timestamp or null.` },
        { status: 400 },
      );
    }
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
  const unpaidBreakMinutes =
    body.unpaid_break_minutes === undefined
      ? undefined
      : normalizeUnpaidBreakMinutes(body.unpaid_break_minutes);
  if (
    body.unpaid_break_minutes !== undefined &&
    unpaidBreakMinutes === undefined
  ) {
    return NextResponse.json(
      { error: "Unpaid break minutes must be a whole number from 0 through 1440." },
      { status: 400 },
    );
  }

  const admin: AdminClient = createAdminSupabase();
  const { data: existing, error: existingError } = await admin
    .from("staff_schedule_overrides")
    .select("*")
    .eq("id", overrideId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Override not found" }, { status: 404 });
  }

  const nextStart =
    body.start_time !== undefined ? body.start_time : existing.start_time;
  const nextEnd =
    body.end_time !== undefined ? body.end_time : existing.end_time;
  if (Boolean(nextStart) !== Boolean(nextEnd)) {
    return NextResponse.json(
      { error: "Provide both schedule start and end times, or leave both blank." },
      { status: 400 },
    );
  }
  const nextStartMs =
    typeof nextStart === "string" ? new Date(nextStart).getTime() : null;
  const nextEndMs =
    typeof nextEnd === "string" ? new Date(nextEnd).getTime() : null;
  if (
    (nextStartMs !== null && !Number.isFinite(nextStartMs)) ||
    (nextEndMs !== null && !Number.isFinite(nextEndMs)) ||
    (nextStartMs !== null && nextEndMs !== null && nextEndMs <= nextStartMs)
  ) {
    return NextResponse.json(
      { error: "Schedule end must be a valid timestamp after start." },
      { status: 400 },
    );
  }

  const { data, error } = await scheduleOverrideRpc(admin)(
    "save_staff_schedule_override_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_actor_profile_id: access.profile.id,
      p_actor_auth_user_id: access.authUserId,
      p_override_id: overrideId,
      p_target_user_id: existing.user_id,
      p_schedule_date: existing.schedule_date,
      p_start_time: nextStart,
      p_end_time: nextEnd,
      p_unpaid_break_minutes:
        unpaidBreakMinutes ?? existing.unpaid_break_minutes ?? 0,
      p_notes:
        body.notes === undefined
          ? existing.notes
          : body.notes === null
            ? null
            : body.notes.trim() || null,
      p_status:
        body.status === undefined ? existing.status : String(body.status),
    },
  );
  if (error || !data) {
    const message = error?.message ?? "Schedule override was not updated.";
    return NextResponse.json(
      { error: message },
      { status: scheduleOverrideErrorStatus(message) },
    );
  }

  return NextResponse.json({ ok: true, override: data });
}

export async function DELETE(_req: NextRequest, context: Ctx) {
  const { overrideId } = await context.params;
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  const admin: AdminClient = createAdminSupabase();
  const { data: existing, error: existingError } = await admin
    .from("staff_schedule_overrides")
    .select("*")
    .eq("id", overrideId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json(
      { error: existingError.message },
      { status: 500 },
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "Override not found" }, { status: 404 });
  }

  const { data, error } = await scheduleOverrideRpc(admin)(
    "save_staff_schedule_override_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_actor_profile_id: access.profile.id,
      p_actor_auth_user_id: access.authUserId,
      p_override_id: overrideId,
      p_target_user_id: existing.user_id,
      p_schedule_date: existing.schedule_date,
      p_start_time: existing.start_time,
      p_end_time: existing.end_time,
      p_unpaid_break_minutes: existing.unpaid_break_minutes ?? 0,
      p_notes: existing.notes,
      p_status: "cancelled",
    },
  );
  if (error || !data) {
    const message = error?.message ?? "Schedule override was not cancelled.";
    return NextResponse.json(
      { error: message },
      { status: scheduleOverrideErrorStatus(message) },
    );
  }

  return NextResponse.json({
    ok: true,
    override: data,
  });
}
