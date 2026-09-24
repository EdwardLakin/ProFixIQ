export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { syncGeotabConnection } from "@/features/integrations/fleetTrackers/geotab/sync";

export async function POST() {
  const auth = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!auth.ok) return auth.response;

  const { data: connection, error } = await auth.supabase
    .from("fleet_tracker_connections")
    .select("id, shop_id, credentials")
    .eq("shop_id", auth.profile.shop_id)
    .eq("vendor", "geotab")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!connection) {
    return NextResponse.json(
      { ok: false, error: "No Geotab connection for this shop." },
      { status: 404 },
    );
  }

  const syncResult = await syncGeotabConnection(auth.supabase, connection);

  if (!syncResult.ok) {
    return NextResponse.json({ ok: false, error: syncResult.error }, { status: 502 });
  }

  return NextResponse.json(syncResult);
}
