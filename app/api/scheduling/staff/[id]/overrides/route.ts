import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { shopLocalDateTimeToUtc } from "@/features/shared/lib/utils/shopDayWindow";

type Ctx = { params: Promise<{ id: string }> };
type AdminClient = ReturnType<typeof createAdminSupabase>;

export async function POST(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const actor = getActorCapabilities({ role: access.profile.role });
  if (!actor.canManageScheduling) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const admin: AdminClient = createAdminSupabase();
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("timezone")
    .eq("id", access.profile.shop_id)
    .maybeSingle();
  if (shopError) return NextResponse.json({ error: shopError.message }, { status: 500 });

  let startTime = body.start_time ?? null;
  let endTime = body.end_time ?? null;
  try {
    if (body.start_local) startTime = shopLocalDateTimeToUtc(body.schedule_date, body.start_local, shop?.timezone);
    if (body.end_local) endTime = shopLocalDateTimeToUtc(body.schedule_date, body.end_local, shop?.timezone);
  } catch {
    return NextResponse.json({ error: "Invalid shop-local schedule time" }, { status: 400 });
  }
  if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
    return NextResponse.json({ error: "Schedule end must be after start" }, { status: 400 });
  }

  const { error } = await admin.from("staff_schedule_overrides").insert({
    shop_id: access.profile.shop_id,
    user_id: id,
    schedule_date: body.schedule_date,
    start_time: startTime,
    end_time: endTime,
    unpaid_break_minutes: Math.max(0, Number(body.unpaid_break_minutes ?? 0)),
    notes: body.notes ?? null,
    source_type: "manual_override",
    status: "scheduled",
    created_by: access.profile.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("audit_logs").insert({
    actor_id: access.profile.id,
    action: "staff.schedule.override.created",
    target: id,
    metadata: { shop_id: access.profile.shop_id, schedule_date: body.schedule_date },
  });

  return NextResponse.json({ ok: true });
}
