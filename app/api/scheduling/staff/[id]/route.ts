import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };
type AdminClient = ReturnType<typeof createAdminSupabase>;

async function checkStaffInShop(admin: AdminClient, shopId: string, userId: string) {
  const { data, error } = await admin.from("profiles").select("id, shop_id, full_name, email, role").eq("id", userId).maybeSingle();
  if (error) return { ok: false, error: error.message } as const;
  if (!data || data.shop_id !== shopId) return { ok: false, error: "Staff not found" } as const;
  return { ok: true, profile: data } as const;
}

export async function GET(_req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const actor = getActorCapabilities({ role: access.profile.role });
  if (!actor.canManageScheduling) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin: AdminClient = createAdminSupabase();
  const check = await checkStaffInShop(admin, access.profile.shop_id!, id);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 404 });

  const [{ data: templates }, { data: overrides }, { data: blocks }, { data: requests }] = await Promise.all([
    admin.from("staff_schedule_templates").select("*").eq("shop_id", access.profile.shop_id).eq("user_id", id).order("day_of_week", { ascending: true }),
    admin.from("staff_schedule_overrides").select("*").eq("shop_id", access.profile.shop_id).eq("user_id", id).order("schedule_date", { ascending: true }).limit(60),
    admin.from("staff_availability_blocks").select("*").eq("shop_id", access.profile.shop_id).eq("user_id", id).order("starts_at", { ascending: true }).limit(60),
    admin.from("staff_time_off_requests").select("*").eq("shop_id", access.profile.shop_id).eq("user_id", id).order("created_at", { ascending: false }).limit(60),
  ]);

  return NextResponse.json({ person: check.profile, templates: templates ?? [], overrides: overrides ?? [], availability_blocks: blocks ?? [], time_off_requests: requests ?? [] });
}

export async function PUT(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const actor = getActorCapabilities({ role: access.profile.role });
  if (!actor.canManageScheduling) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 404 });

  const normalized = body.templates
    .filter((row) => Number.isInteger(row.day_of_week) && row.day_of_week >= 0 && row.day_of_week <= 6)
    .map((row) => ({
      shop_id: access.profile.shop_id,
      user_id: id,
      day_of_week: row.day_of_week,
      is_working_day: row.is_working_day ?? true,
      start_time: row.start_time ?? null,
      end_time: row.end_time ?? null,
      unpaid_break_minutes: Math.max(0, Number(row.unpaid_break_minutes ?? 0)),
      effective_from: row.effective_from ?? null,
      effective_to: row.effective_to ?? null,
    }));

  const { error } = await (admin as any).rpc("replace_staff_schedule_template", {
    p_shop_id: access.profile.shop_id,
    p_actor_profile_id: access.profile.id,
    p_target_user_id: id,
    p_templates: normalized,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, templates: normalized });
}
