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

  const [profilesRes, templatesRes, overridesRes, blocksRes, requestsRes] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, role").eq("shop_id", access.profile.shop_id).order("full_name", { ascending: true }),
    admin.from("staff_schedule_templates").select("*").eq("shop_id", access.profile.shop_id),
    admin.from("staff_schedule_overrides").select("*").eq("shop_id", access.profile.shop_id).gte("schedule_date", from.slice(0, 10)).lte("schedule_date", to.slice(0, 10)),
    admin.from("staff_availability_blocks").select("*").eq("shop_id", access.profile.shop_id).lte("starts_at", to).gte("ends_at", from),
    admin.from("staff_time_off_requests").select("*").eq("shop_id", access.profile.shop_id).eq("status", "pending").order("created_at", { ascending: true }).limit(50),
  ]);

  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  if (templatesRes.error) return NextResponse.json({ error: templatesRes.error.message }, { status: 500 });
  if (overridesRes.error) return NextResponse.json({ error: overridesRes.error.message }, { status: 500 });
  if (blocksRes.error) return NextResponse.json({ error: blocksRes.error.message }, { status: 500 });
  if (requestsRes.error) return NextResponse.json({ error: requestsRes.error.message }, { status: 500 });

  const templates = templatesRes.data ?? [];
  const overrides = overridesRes.data ?? [];
  const blocks = blocksRes.data ?? [];

  const staff = (profilesRes.data ?? []).map((p) => {
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

    return {
      ...p,
      recurring_template_rows: personTemplates.length,
      weekly_recurring_minutes: recurringMinutes,
      override_count_in_range: personOverrides.length,
      approved_away_blocks_in_range: personBlocks.length,
      is_away_today: isAwayToday,
      next_override: personOverrides
        .slice()
        .sort((a, b) => String(a.schedule_date).localeCompare(String(b.schedule_date)))[0] ?? null,
    };
  });

  return NextResponse.json({
    staff,
    templates,
    overrides,
    availability_blocks: blocks,
    pending_time_off_requests: requestsRes.data ?? [],
  });
}
