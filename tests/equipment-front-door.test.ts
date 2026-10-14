import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Equipment front door", () => {
  it("keeps Equipment onboarding inside the Equipment workspace", () => {
    const directory = source("features/equipment/components/EquipmentDirectoryView.tsx");

    expect(directory).toContain("Add Equipment");
    expect(directory).toContain("Create equipment");
    expect(directory).toContain("Add existing asset");
    expect(directory).toContain("You’ll land directly in Asset Health after setup.");
    expect(directory).not.toContain("Open any asset from");
    expect(directory).not.toContain("Vehicle Files");
  });

  it("creates the canonical Shop asset and Equipment profile through one boundary", () => {
    const route = source("app/api/equipment/assets/route.ts");

    expect(route).toContain('.from("vehicles")');
    expect(route).toContain("saveEquipmentAssetProfile");
    expect(route).toContain("An active Equipment subscription is required.");
    expect(route).toContain("Use ‘Add existing asset’ instead.");
    expect(route).toContain('.delete()');
  });

  it("lands newly configured machines in Asset Health with guided next steps", () => {
    const directory = source("features/equipment/components/EquipmentDirectoryView.tsx");
    const page = source("app/equipment/[assetId]/page.tsx");
    const guide = source("features/equipment/components/EquipmentSetupGuide.tsx");

    expect(directory).toContain("/equipment/${assetId}?setup=1");
    expect(page).toContain('query.setup === "1"');
    expect(guide).toContain("Add standard components");
    expect(guide).toContain("Create PM plan");
    expect(guide).toContain("Record current meter");
    expect(guide).toContain("Build inspection");
  });
});
