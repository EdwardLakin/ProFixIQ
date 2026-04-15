import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type Ctx = { params: Promise<{ overrideId: string }> };

export async function PATCH(req: NextRequest, context: Ctx) {
  const { overrideId } = await context.params;
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const actor = getActorCapabilities({ role: access.profile.role });
  if (!actor.canManageScheduling) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {
    ...(body.start_time !== undefined ? { start_time: body.start_time } : {}),
    ...(body.end_time !== undefined ? { end_time: body.end_time } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(body.unpaid_break_minutes !== undefined ? { unpaid_break_minutes: Math.max(0, Number(body.unpaid_break_minutes ?? 0)) } : {}),
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminSupabase() as any;
  const { data, error } = await admin
    .from("staff_schedule_overrides")
    .update(update)
    .eq("id", overrideId)
    .eq("shop_id", access.profile.shop_id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Override not found" }, { status: 404 });

  await admin.from("audit_logs").insert({
    actor_id: access.profile.id,
    action: "staff.schedule.override.updated",
    target: data.user_id,
    metadata: { shop_id: access.profile.shop_id, override_id: overrideId, status: data.status },
  });

  return NextResponse.json({ ok: true, override: data });
}

export async function DELETE(_req: NextRequest, context: Ctx) {
  const { overrideId } = await context.params;
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const actor = getActorCapabilities({ role: access.profile.role });
  if (!actor.canManageScheduling) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminSupabase() as any;
  const { data, error } = await admin
    .from("staff_schedule_overrides")
    .delete()
    .eq("id", overrideId)
    .eq("shop_id", access.profile.shop_id)
    .select("id, user_id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Override not found" }, { status: 404 });

  await admin.from("audit_logs").insert({
    actor_id: access.profile.id,
    action: "staff.schedule.override.deleted",
    target: data.user_id,
    metadata: { shop_id: access.profile.shop_id, override_id: overrideId },
  });

  return NextResponse.json({ ok: true });
}
