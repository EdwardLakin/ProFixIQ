import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveCanonicalStaffProfile } from "@/features/shared/lib/authenticated-profile";
import { hasAnyRole, ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { geotabAdapter } from "@/features/integrations/fleetTrackers/geotab/adapter";
import { GeotabApiError } from "@/features/integrations/fleetTrackers/geotab/client";

export async function GET() {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { profile, error: profileError } = await resolveCanonicalStaffProfile(
    supabase,
    user.id,
  );

  if (profileError) {
    return NextResponse.json({ error: profileError }, { status: 500 });
  }

  if (!profile || !hasAnyRole(profile.role, ROLE_GROUPS.accountAdministrators)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // No per-shop tracker connection exists yet (schema lands in a follow-up),
  // so this diagnostic stays locked to one explicitly authorized shop rather
  // than exposing the single deployment-wide Geotab credential set to every
  // shop's owner/admin.
  const authorizedShopId = process.env.GEOTAB_TEST_SHOP_ID?.trim();
  if (!authorizedShopId || profile.shop_id !== authorizedShopId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const vehicles = await geotabAdapter.fetchVehicles();
    return NextResponse.json({
      ok: true,
      vehicleCount: vehicles.length,
      sample: vehicles.slice(0, 5).map((v) => ({ name: v.name, vin: v.vin })),
    });
  } catch (error) {
    const message =
      error instanceof GeotabApiError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
