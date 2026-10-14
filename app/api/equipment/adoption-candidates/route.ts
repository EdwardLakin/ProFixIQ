export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const NO_STORE = { "Cache-Control": "private, no-store" };
const PAGE_SIZE = 50;
const RETIRED_VEHICLE_STATUSES = new Set(["archived", "merged", "duplicate", "inactive"]);

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({ allowRoles: ROLE_GROUPS.billingOperators });
  if (!access.ok) return access.response;

  const entitlement = await resolveEquipmentAddonEntitlementForShop(access.profile.shop_id).catch((error) => {
    console.error("[equipment/adoption-candidates] entitlement failed", {
      shopId: access.profile.shop_id,
      error,
    });
    return null;
  });
  if (!entitlement) return json({ error: "Equipment entitlement could not be verified. Try again." }, 503);
  if (!entitlement.enabled) return json({ error: "An active Equipment subscription is required." }, 403);

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const rawOffset = Number(url.searchParams.get("offset") ?? "0");
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  let vehicleQuery = access.supabase
    .from("vehicles")
    .select("id,unit_number,year,make,model,vin,customer_id,engine_hours,status")
    .eq("shop_id", access.profile.shop_id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (query) {
    vehicleQuery = vehicleQuery.ilike("unit_number", `%${escapeLike(query)}%`);
  }

  const vehicleResult = await vehicleQuery;
  if (vehicleResult.error) {
    console.error("[equipment/adoption-candidates] vehicle load failed", vehicleResult.error);
    return json({ error: "Equipment adoption candidates could not be loaded." }, 500);
  }

  const vehicleRows = vehicleResult.data ?? [];
  const activeRows = vehicleRows.filter((row) => {
    const status = String(row.status ?? "").trim().toLowerCase();
    return !RETIRED_VEHICLE_STATUSES.has(status);
  });

  const profiled = new Set<string>();
  if (activeRows.length > 0) {
    const admin = createAdminSupabase();
    const profileResult = await admin
      .from("equipment_asset_profiles")
      .select("vehicle_id")
      .eq("shop_id", access.profile.shop_id)
      .in(
        "vehicle_id",
        activeRows.map((row) => row.id),
      );

    if (profileResult.error) {
      console.error("[equipment/adoption-candidates] profile load failed", profileResult.error);
      return json({ error: "Equipment adoption candidates could not be loaded." }, 500);
    }
    for (const row of profileResult.data ?? []) profiled.add(row.vehicle_id);
  }

  const candidates = activeRows
    .filter((row) => !profiled.has(row.id))
    .map((row) => ({
      id: row.id,
      unitNumber: row.unit_number,
      year: row.year,
      make: row.make,
      model: row.model,
      vin: row.vin,
      customerId: row.customer_id,
      engineHours: row.engine_hours,
    }));

  const hasMore = vehicleRows.length === PAGE_SIZE;
  return json({
    candidates,
    nextOffset: hasMore ? offset + PAGE_SIZE : null,
    hasMore,
  });
}
