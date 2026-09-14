export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { resolveWorkOrderFinancialAccess } from "@/features/work-orders/workspace/server/workOrderFinancialAuthorization";
import { loadDeferredWorkHistoryForVehicle } from "@/features/work-orders/server/deferredWorkHistory";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];

const ALLOWED_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "lead_hand",
  "foreman",
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

async function resolveVehicleId(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  url: URL;
}): Promise<string | null> {
  const requested = input.url.searchParams.get("vehicleId")?.trim() ?? "";
  if (requested) {
    if (!UUID_PATTERN.test(requested)) return null;
    const { data } = await input.admin
      .from("vehicles")
      .select("id")
      .eq("id", requested)
      .eq("shop_id", input.shopId)
      .maybeSingle<Pick<Vehicle, "id">>();
    return data?.id ?? null;
  }

  const vin = input.url.searchParams.get("vin")?.trim() ?? "";
  const plate = input.url.searchParams.get("plate")?.trim() ?? "";
  const unit = input.url.searchParams.get("unit")?.trim() ?? "";
  if (!vin && !plate && !unit) return null;

  let query = input.admin
    .from("vehicles")
    .select("id")
    .eq("shop_id", input.shopId)
    .limit(2);

  if (vin) query = query.eq("vin", vin);
  else if (plate) query = query.eq("license_plate", plate);
  else query = query.eq("unit_number", unit);

  const { data, error } = await query;
  if (error || !data || data.length !== 1) return null;
  return (data[0] as Pick<Vehicle, "id">).id;
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({ allowRoles: ALLOWED_ROLES });
  if (!access.ok) return access.response;

  const financial = await resolveWorkOrderFinancialAccess({
    supabase: access.supabase,
    profileId: access.profile.id,
    shopId: access.profile.shop_id,
  });
  if (financial.error) {
    return NextResponse.json(
      { error: "Workspace authorization could not be resolved." },
      { status: 500 },
    );
  }

  const canViewPricing = financial.access.canViewSellPricing;
  const admin = createAdminSupabase();
  const url = new URL(request.url);
  const vehicleId = await resolveVehicleId({
    admin,
    shopId: access.profile.shop_id,
    url,
  });

  if (!vehicleId) {
    return NextResponse.json(
      { ok: true, vehicleId: null, canViewPricing, items: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const { items, error } = await loadDeferredWorkHistoryForVehicle({
    admin,
    shopId: access.profile.shop_id,
    vehicleId,
    canViewPricing,
  });
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, vehicleId, canViewPricing, items },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
