export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function POST() {
  const auth = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!auth.ok) return auth.response;

  const { error } = await auth.supabase
    .from("fleet_tracker_connections")
    .delete()
    .eq("shop_id", auth.profile.shop_id)
    .eq("vendor", "geotab");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
