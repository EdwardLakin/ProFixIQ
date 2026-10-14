import { unstable_noStore as noStore } from "next/cache";

import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentDirectoryView from "@/features/equipment/components/EquipmentDirectoryView";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { loadEquipmentDirectory } from "@/features/equipment/server/loadEquipmentDirectory";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RETIRED_VEHICLE_STATUSES = new Set(["archived", "merged", "duplicate", "inactive"]);
const CUSTOMER_PAGE_SIZE = 500;

export default async function EquipmentDirectoryPage() {
  noStore();

  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_DIRECTORY_ROLES,
  });

  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled") {
    return <EquipmentAccessState state={entitlement} retryHref="/equipment" />;
  }

  const supabase = createServerSupabaseRSC();
  const admin = createAdminSupabase();
  const directory = await loadEquipmentDirectory({
    supabase,
    admin,
    shopId: profile.shop_id,
    role: canonicalRole,
  });

  const canManage = (ROLE_GROUPS.billingOperators as readonly string[]).includes(canonicalRole);
  let candidates: Array<{
    id: string;
    unitNumber: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    vin: string | null;
    customerId: string | null;
    engineHours: number | null;
  }> = [];
  let customers: Array<{ id: string; name: string }> = [];

  if (canManage) {
    const vehicleResult = await supabase
      .from("vehicles")
      .select("id,unit_number,year,make,model,vin,customer_id,engine_hours,status")
      .eq("shop_id", profile.shop_id)
      .order("created_at", { ascending: false })
      .limit(250);

    if (vehicleResult.error) {
      console.error("[equipment/page] vehicle candidate load failed", vehicleResult.error);
      throw new Error("Equipment adoption candidates could not be loaded.");
    }

    const visibleVehicles = (vehicleResult.data ?? []).filter((row) => {
      const status = String(row.status ?? "").trim().toLowerCase();
      return !RETIRED_VEHICLE_STATUSES.has(status);
    });
    const visibleVehicleIds = visibleVehicles.map((row) => row.id);
    let profiled = new Set<string>();

    if (visibleVehicleIds.length > 0) {
      const profileResult = await admin
        .from("equipment_asset_profiles")
        .select("vehicle_id")
        .eq("shop_id", profile.shop_id)
        .in("vehicle_id", visibleVehicleIds);

      if (profileResult.error) {
        console.error("[equipment/page] profile candidate load failed", profileResult.error);
        throw new Error("Equipment adoption candidates could not be loaded.");
      }
      profiled = new Set((profileResult.data ?? []).map((row) => row.vehicle_id));
    }

    candidates = visibleVehicles
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

    const customerRows: Array<{
      id: string;
      name: string | null;
      business_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      phone_number: string | null;
    }> = [];
    for (let offset = 0; ; offset += CUSTOMER_PAGE_SIZE) {
      const customerResult = await supabase
        .from("customers")
        .select("id,name,business_name,first_name,last_name,email,phone,phone_number")
        .eq("shop_id", profile.shop_id)
        .eq("active", true)
        .is("archived_at", null)
        .is("merged_into_customer_id", null)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + CUSTOMER_PAGE_SIZE - 1);

      if (customerResult.error) {
        console.error("[equipment/page] customer load failed", customerResult.error);
        throw new Error("Equipment customer options could not be loaded.");
      }

      const batch = customerResult.data ?? [];
      customerRows.push(...batch);
      if (batch.length < CUSTOMER_PAGE_SIZE) break;
    }

    customers = customerRows.map((row) => {
      const displayName =
        row.business_name?.trim() ||
        row.name?.trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        "Customer";
      const secondary =
        row.email?.trim() ||
        row.phone?.trim() ||
        row.phone_number?.trim() ||
        `Acct ${row.id.slice(0, 8)}`;
      return { id: row.id, name: `${displayName} · ${secondary}` };
    });
  }

  return (
    <EquipmentDirectoryView
      rows={directory.rows}
      truncated={directory.truncated}
      canManage={canManage}
      candidates={candidates}
      customers={customers}
    />
  );
}
