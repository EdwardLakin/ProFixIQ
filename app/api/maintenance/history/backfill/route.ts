import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { backfillMaintenanceHistorySignals } from "@/features/maintenance/server/backfillMaintenanceHistorySignals";
import { getActorCapabilities } from "@/features/shared/lib/rbac";


export async function POST() {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();

  if (profileError || !profile?.shop_id) {
    return NextResponse.json({ error: "Unable to resolve shop context" }, { status: 400 });
  }

  const actor = getActorCapabilities({ role: profile.role });
  if (!actor.isKnownRole || !actor.canViewShopWideData) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await backfillMaintenanceHistorySignals({
      supabase,
      shopId: profile.shop_id,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to backfill maintenance history";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
