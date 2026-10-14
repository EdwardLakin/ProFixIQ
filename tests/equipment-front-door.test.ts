import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Equipment front door", () => {
  it("keeps Equipment onboarding inside the Equipment workspace", () => {
    const directory = source("features/equipment/components/EquipmentDirectoryView.tsx");
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");

    expect(directory).toContain("Add Equipment");
    expect(directory).toContain("Create equipment");
    expect(directory).toContain("Add existing asset");
    expect(directory).toContain("You’ll land directly in Asset Health after setup.");
    expect(directory).not.toContain("Open any asset from");
    expect(directory).not.toContain("Vehicle Files");
    expect(setup).toContain("Create equipment");
    expect(setup).toContain("Add existing asset");
  });

  it("loads adoption candidates only when requested and keeps customer options complete", () => {
    const page = source("app/equipment/page.tsx");
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");
    const candidateRoute = source("app/api/equipment/adoption-candidates/route.ts");

    expect(page).not.toContain("VEHICLE_PAGE_SIZE");
    expect(page).not.toContain("PROFILE_BATCH_SIZE");
    expect(page).not.toContain("visibleVehicleIds");
    expect(setup).toContain("/api/equipment/adoption-candidates");
    expect(setup).toContain("Search existing assets by unit #");
    expect(setup).toContain("Load more assets");
    expect(candidateRoute).toContain("const PAGE_SIZE = 50");
    expect(candidateRoute).toContain('.range(offset, offset + PAGE_SIZE - 1)');
    expect(candidateRoute).toContain('.ilike("unit_number"');
    expect(candidateRoute).toContain("RETIRED_VEHICLE_STATUSES");
    expect(candidateRoute).toContain('"equipment_asset_profiles"');
    expect(page).toContain('.eq("active", true)');
    expect(page).toContain('.is("archived_at", null)');
    expect(page).toContain('.is("merged_into_customer_id", null)');
    expect(page).toContain("CUSTOMER_PAGE_SIZE");
    expect(page).toContain('.order("id", { ascending: true })');
    expect(page).toContain(".range(offset, offset + CUSTOMER_PAGE_SIZE - 1)");
    expect(page).toContain("Equipment customer options could not be loaded.");
    expect(page).toContain("email,phone,phone_number");
    expect(page).toContain("Acct ${row.id.slice(0, 8)}");
  });

  it("uses an atomic create-only adoption boundary and preserves canonical meters", () => {
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");
    const profileRoute = source("app/api/equipment/assets/[assetId]/profile/route.ts");
    const migration = source("supabase/migrations/20261014141000_atomic_equipment_asset_creation.sql");

    expect(setup).toContain("createOnly: true");
    expect(setup).not.toContain("expectedEngineHours: null");
    expect(setup).toContain("Existing asset values stay canonical");
    expect(profileRoute).toContain("body?.createOnly === true");
    expect(profileRoute).toContain("mutation.currentCycles !== null");
    expect(profileRoute).toContain('"adopt_equipment_asset_atomic"');
    expect(migration).toContain("for update");
    expect(migration).toContain("lower(pg_catalog.btrim(coalesce(v_vehicle.status, '')))");
    expect(migration).toContain("equipment_asset_retired");
    expect(migration).toContain("equipment_customer_inactive");
    expect(migration).toContain("equipment_profile_exists");
  });

  it("serializes new canonical vehicle creation without changing authoritative updates", () => {
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");
    const route = source("app/api/equipment/assets/route.ts");
    const migration = source("supabase/migrations/20261014141000_atomic_equipment_asset_creation.sql");

    expect(setup).toContain("value={form.vin}");
    expect(setup).toContain("Equipment PIN");
    expect(setup).toContain("operationId: creationOperationId");
    expect(route).toContain("isAssetId(body.operationId)");
    expect(route).toContain("const assetId = body.operationId");
    expect(route).toContain("vinResult.isValid");
    expect(route).toContain('"create_equipment_asset_atomic"');
    expect(migration).toContain("vehicles_enforce_normalized_identity_unique");
    expect(migration).toContain("vehicles_normalized_identity_unique");
    expect(migration).toContain("before insert\non public.vehicles");
    expect(migration).not.toContain("before insert or update of shop_id, unit_number, vin");
    expect(migration).toContain("canonical_vehicle_identity:");
    expect(migration).toContain("equipment_unit_duplicate");
    expect(migration).toContain("equipment_vin_duplicate");
    expect(migration).toContain("perform public.save_equipment_asset_profile");
  });

  it("serializes Equipment customer validation with customer merges", () => {
    const migration = source("supabase/migrations/20261014141000_atomic_equipment_asset_creation.sql");

    expect(migration).toContain("select c.active, c.archived_at, c.merged_into_customer_id");
    expect(migration).toContain("for update;");
    expect(migration).toContain("v_customer_active is distinct from true");
    expect(migration).toContain("v_customer_merged_into is not null");
  });

  it("makes successful create retries return the original Equipment asset", () => {
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");
    const migration = source("supabase/migrations/20261014141000_atomic_equipment_asset_creation.sql");

    expect(setup).toContain("crypto.randomUUID()");
    expect(setup).toContain("operationId: creationOperationId");
    expect(migration).toContain("durable operation identity");
    expect(migration).toContain("where v.id = p_vehicle_id");
    expect(migration).toContain("return p_vehicle_id;");
    expect(migration).toContain("equipment_operation_incomplete");
  });

  it("rejects archived or merged customer assignments at both create boundaries", () => {
    const route = source("app/api/equipment/assets/route.ts");
    const migration = source("supabase/migrations/20261014141000_atomic_equipment_asset_creation.sql");

    expect(route).toContain('select("id,active,archived_at,merged_into_customer_id")');
    expect(route).toContain("!customer.active || customer.archived_at || customer.merged_into_customer_id");
    expect(route).toContain("Choose an active customer account before creating Equipment.");
    expect(migration).toContain("v_customer_active is distinct from true");
    expect(migration).toContain("v_customer_archived_at is not null");
    expect(migration).toContain("v_customer_merged_into is not null");
  });

  it("disambiguates every adoption candidate with a stable asset identifier", () => {
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");

    expect(setup).toContain('primary || "Unnamed asset"');
    expect(setup).toContain("Asset ${candidate.id.slice(0, 8)}");
  });

  it("prevents dismissing the setup dialog while a mutation is in flight", () => {
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");

    expect(setup).toContain("if (saving) return");
    expect(setup).toContain("aria-busy={saving}");
    expect(setup).toContain('className={BUTTON} disabled={saving} onClick={onClose}');
  });

  it("shows setup completion only for an actual Equipment profile", () => {
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");
    const page = source("app/equipment/[assetId]/page.tsx");
    const guide = source("features/equipment/components/EquipmentSetupGuide.tsx");

    expect(setup).toContain("/equipment/${assetId}?setup=1");
    expect(page).toContain('query.setup === "1" && health.equipment.profile');
    expect(guide).toContain("Add standard components");
    expect(guide).toContain("Create PM plan");
    expect(guide).toContain("Record current meter");
    expect(guide).toContain("Build inspection");
  });
});
