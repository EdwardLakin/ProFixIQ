import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Equipment canonical front door", () => {
  it("keeps vehicles as the canonical asset when creating Equipment", () => {
    const route = source("app/api/equipment/assets/route.ts");

    expect(route).toContain('.from("vehicles")');
    expect(route).toContain("The canonical asset was kept");
    expect(route).toContain("saveEquipmentAssetProfile");
    expect(route).not.toContain('.from("vehicles").delete');
    expect(route).not.toContain("lock table public.vehicles");
    expect(route).not.toContain("create_equipment_asset_atomic");
  });

  it("uses the existing vehicle duplicate-check contract before creation", () => {
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");

    expect(setup).toContain("checkVehicleDuplicates");
    expect(setup).toContain('match.same_customer === true');
    expect(setup).toContain('match.match_type === "vin" && match.same_customer === false');
    expect(setup).toContain("use Add existing asset");
    expect(setup).toContain("canonical vehicle record");
  });

  it("keeps Equipment browsing available when customer options fail", () => {
    const page = source("app/equipment/page.tsx");
    const directory = source("features/equipment/components/EquipmentDirectoryView.tsx");
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");

    expect(page).toContain("customerOptionsError");
    expect(page).not.toContain('throw new Error("Equipment customer options could not be loaded.")');
    expect(directory).toContain("customerOptionsError={customerOptionsError}");
    expect(setup).toContain("Boolean(customerOptionsError)");
  });

  it("attaches Equipment as a create-only profile extension", () => {
    const route = source("app/api/equipment/assets/[assetId]/profile/route.ts");

    expect(route).toContain("body?.createOnly === true");
    expect(route).toContain('.from("equipment_asset_profiles").insert');
    expect(route).toContain("authorizeEquipmentAsset");
    expect(route).toContain("Equipment is already enabled for this asset.");
  });

  it("loads existing canonical assets on demand without a hard pagination ceiling", () => {
    const route = source("app/api/equipment/adoption-candidates/route.ts");
    const setup = source("features/equipment/components/EquipmentSetupDialog.tsx");

    expect(route).toContain("const PAGE_SIZE = 50");
    expect(route).toContain("offset + PAGE_SIZE - 1");
    expect(route).not.toContain("20000");
    expect(route).toContain('"equipment_asset_profiles"');
    expect(setup).toContain("Load more assets");
    expect(setup).toContain("Search unit, VIN, make or model");
  });

  it("makes Equipment onboarding available from the Equipment directory", () => {
    const page = source("app/equipment/page.tsx");
    const directory = source("features/equipment/components/EquipmentDirectoryView.tsx");

    expect(page).toContain("canManage={canManage}");
    expect(directory).toContain("Add Equipment");
    expect(directory).toContain("Create equipment");
    expect(directory).toContain("Add existing asset");
    expect(directory).not.toContain("Open any asset from");
  });
});
