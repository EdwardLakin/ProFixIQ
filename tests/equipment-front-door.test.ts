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

  it("loads adoption candidates and all active canonical customers", () => {
    const page = source("app/equipment/page.tsx");

    expect(page).toContain('.select("id,unit_number,year,make,model,vin,customer_id,engine_hours,status")');
    expect(page).toContain("RETIRED_VEHICLE_STATUSES");
    expect(page).toContain('.order("created_at"');
    expect(page).not.toContain('.order("updated_at"');
    expect(page).toContain('.in("vehicle_id", visibleVehicleIds)');
    expect(page).toContain('.eq("active", true)');
    expect(page).toContain('.is("archived_at", null)');
    expect(page).toContain('.is("merged_into_customer_id", null)');
    expect(page).toContain("CUSTOMER_PAGE_SIZE");
    expect(page).toContain('.order("id", { ascending: true })');
    expect(page).toContain(".range(offset, offset + CUSTOMER_PAGE_SIZE - 1)");
    expect(page).not.toContain(".limit(500)");
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
    expect(migration).toContain("equipment_asset_retired");
    expect(migration).toContain("equipment_customer_inactive");
    expect(migration).toContain("equipment_profile_exists");
  });

  it("creates canonical Equipment assets atomically under a shop lock", () => {
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");
    const route = source("app/api/equipment/assets/route.ts");
    const migration = source("supabase/migrations/20261014141000_atomic_equipment_asset_creation.sql");

    expect(setup).toContain("value={form.vin}");
    expect(setup).toContain("Equipment PIN");
    expect(route).toContain('import { randomUUID } from "node:crypto"');
    expect(route).toContain("vinResult.isValid");
    expect(route).toContain("vinResult.message");
    expect(route).toContain('"create_equipment_asset_atomic"');
    expect(route).toContain("DUPLICATE_VIN_MESSAGE");
    expect(route).toContain("const assetId = randomUUID()");
    expect(route).not.toContain("loadDuplicates");
    expect(route).not.toContain("partial: true");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("lower(pg_catalog.btrim(coalesce(v.unit_number, ''))) = v_unit_normalized");
    expect(migration).toContain("equipment_unit_duplicate");
    expect(migration).toContain("equipment_vin_duplicate");
    expect(migration).toContain("perform public.save_equipment_asset_profile");
  });

  it("rejects archived or merged customer assignments at both create boundaries", () => {
    const route = source("app/api/equipment/assets/route.ts");
    const migration = source("supabase/migrations/20261014141000_atomic_equipment_asset_creation.sql");

    expect(route).toContain('select("id,active,archived_at,merged_into_customer_id")');
    expect(route).toContain("!customer.active || customer.archived_at || customer.merged_into_customer_id");
    expect(route).toContain("Choose an active customer account before creating Equipment.");
    expect(migration).toContain("c.active = true");
    expect(migration).toContain("c.archived_at is null");
    expect(migration).toContain("c.merged_into_customer_id is null");
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
