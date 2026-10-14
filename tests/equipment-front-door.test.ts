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
    expect(page).toContain(".range(offset, offset + CUSTOMER_PAGE_SIZE - 1)");
    expect(page).not.toContain(".limit(500)");
    expect(page).toContain("Equipment customer options could not be loaded.");
  });

  it("makes existing-asset adoption create-only and preserves canonical meter state", () => {
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");
    const profileRoute = source("app/api/equipment/assets/[assetId]/profile/route.ts");

    expect(setup).toContain("createOnly: true");
    expect(setup).not.toContain("expectedEngineHours: null");
    expect(setup).toContain("Existing asset values stay canonical");
    expect(profileRoute).toContain("body?.createOnly === true");
    expect(profileRoute).toContain('.from("equipment_asset_profiles").insert(');
    expect(profileRoute).toContain("Equipment is already enabled for this asset.");
  });

  it("validates VINs and restricts duplicate arbitration to exact matches", () => {
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");
    const route = source("app/api/equipment/assets/route.ts");

    expect(setup).toContain("value={form.vin}");
    expect(setup).toContain("Equipment PIN");
    expect(route).toContain('import { randomUUID } from "node:crypto"');
    expect(route).toContain("vinResult.isValid");
    expect(route).toContain("vinResult.message");
    expect(route).toContain("isExactDuplicate");
    expect(route).toContain("const beforeExact = before.rows.filter");
    expect(route).toContain("after.rows\n    .filter((row) => isExactDuplicate");
    expect(route).toContain("DUPLICATE_VIN_MESSAGE");
    expect(route).toContain("const assetId = randomUUID()");
  });

  it("rejects archived or merged customer assignments at the write boundary", () => {
    const route = source("app/api/equipment/assets/route.ts");

    expect(route).toContain('select("id,active,archived_at,merged_into_customer_id")');
    expect(route).toContain("!customer.active || customer.archived_at || customer.merged_into_customer_id");
    expect(route).toContain("Choose an active customer account before creating Equipment.");
  });

  it("records initial hours through the atomic profile meter write", () => {
    const route = source("app/api/equipment/assets/route.ts");

    expect(route).toContain("engine_hours: null");
    expect(route).toContain("p_set_engine_hours: engineHours !== null");
    expect(route).toContain("p_engine_hours: engineHours");
    expect(route).toContain("p_expected_engine_hours: null");
  });

  it("surfaces recoverable partial state when compensation cannot clean up", () => {
    const route = source("app/api/equipment/assets/route.ts");

    expect(route).toContain("duplicate verification and cleanup failed");
    expect(route).toContain("duplicate loser cleanup failed");
    expect(route).toContain("failed to clean up incomplete asset");
    expect(route).toContain("partial: true");
    expect(route).toContain("Use Add existing asset");
  });

  it("prevents dismissing the setup dialog while a mutation is in flight", () => {
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");

    expect(setup).toContain("if (saving) return");
    expect(setup).toContain("aria-busy={saving}");
    expect(setup).toContain('className={BUTTON} disabled={saving} onClick={onClose}');
  });

  it("verifies profile persistence before profile-failure compensation", () => {
    const route = source("app/api/equipment/assets/route.ts");
    const verifyIndex = route.indexOf("persistedProfile");
    const profileFailureIndex = route.indexOf("profile creation failed");

    expect(verifyIndex).toBeGreaterThan(-1);
    expect(profileFailureIndex).toBeGreaterThan(verifyIndex);
    expect(route).toContain("profile persistence could not be verified");
  });

  it("lands newly configured machines in Asset Health with guided next steps", () => {
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");
    const page = source("app/equipment/[assetId]/page.tsx");
    const guide = source("features/equipment/components/EquipmentSetupGuide.tsx");

    expect(setup).toContain("/equipment/${assetId}?setup=1");
    expect(page).toContain('query.setup === "1"');
    expect(guide).toContain("Add standard components");
    expect(guide).toContain("Create PM plan");
    expect(guide).toContain("Record current meter");
    expect(guide).toContain("Build inspection");
  });
});
