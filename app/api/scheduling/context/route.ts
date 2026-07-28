// app/api/scheduling/context/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  WORKFORCE_STAFF_ROLES,
  composeActiveWorkforceRoster,
} from "@/features/workforce/lib/roster";

export async function GET() {
  const access = await requireShopScopedApiAccess({
    allowRoles: [...WORKFORCE_STAFF_ROLES],
  });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const { data: me, error: meErr } = await admin
    .from("profiles")
    .select("id, full_name, username, email, role, shop_id")
    .eq("id", access.profile.id)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();

  if (meErr) {
    return NextResponse.json({ error: meErr.message }, { status: 500 });
  }
  if (!me) {
    return NextResponse.json(
      { error: "Employee profile not found" },
      { status: 404 },
    );
  }

  const canEditAll = getActorCapabilities({
    role: me.role,
  }).canManageScheduling;

  let users: Array<{
    id: string;
    full_name: string | null;
    role: string | null;
    shop_id: string | null;
  }> = [];

  if (canEditAll) {
    const [
      { data: profiles, error: profilesError },
      { data: workforceProfiles, error: workforceError },
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, username, email, role")
        .eq("shop_id", me.shop_id)
        .order("created_at", { ascending: false })
        .limit(500),
      admin
        .from("people_workforce_profiles")
        .select("user_id, employment_status, payroll_ready")
        .eq("shop_id", me.shop_id),
    ]);

    if (profilesError || workforceError) {
      return NextResponse.json(
        { error: profilesError?.message ?? workforceError?.message },
        { status: 500 },
      );
    }
    users = composeActiveWorkforceRoster({
      profiles: profiles ?? [],
      workforceProfiles: workforceProfiles ?? [],
    }).map((person) => ({
      id: person.id,
      full_name: person.displayName,
      role: person.role,
      shop_id: me.shop_id,
    }));
  }

  return NextResponse.json({
    me: {
      ...me,
      full_name:
        me.full_name?.trim() ||
        me.username?.trim() ||
        me.email?.trim() ||
        "Employee profile unavailable",
    },
    shopId: me.shop_id,
    canEditAll,
    users,
  });
}
