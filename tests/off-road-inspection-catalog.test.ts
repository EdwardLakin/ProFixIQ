import { describe, expect, it } from "vitest";

import {
  masterInspectionList,
  buildFromMaster,
} from "@/features/inspections/lib/inspection/masterInspectionList";
import {
  offRoadCategoriesForFamily,
  offRoadEquipmentProfiles,
  offRoadInspectionCategories,
} from "@/features/inspections/lib/inspection/offRoadInspectionCatalog";

describe("off-road inspection catalog", () => {
  it("covers the initial equipment families and reusable modules", () => {
    expect(offRoadEquipmentProfiles.length).toBeGreaterThanOrEqual(40);
    expect(offRoadInspectionCategories.length).toBeGreaterThanOrEqual(15);

    const labels = offRoadEquipmentProfiles.map((profile) => profile.label);
    expect(labels).toContain("Forklift");
    expect(labels).toContain("Boom lift");
    expect(labels).toContain("Crawler excavator");
    expect(labels).toContain("Rigid / mining haul truck");
    expect(labels).toContain("Underground LHD / scoop");
  });

  it("filters reusable sections by equipment family", () => {
    const excavator = offRoadCategoriesForFamily("excavation");
    const titles = excavator.map((section) => section.title);

    expect(titles).toContain("Off-Road — Hydraulic System");
    expect(titles).toContain("Off-Road — Undercarriage");
    expect(titles).toContain("Off-Road — Excavator & Shovel");
    expect(
      excavator.flatMap((section) => section.items.map((entry) => entry.item)),
    ).toContain("Swing bearing / swing play");
  });

  it("exposes off-road modules through the shared master list", () => {
    expect(
      masterInspectionList.some(
        (section) => section.title === "Off-Road — Forklift & Telehandler",
      ),
    ).toBe(true);
    expect(
      masterInspectionList.some(
        (section) => section.title === "Off-Road — MEWP / Man Lift Safety",
      ),
    ).toBe(true);
  });

  it("does not leak off-road rows into existing highway quick builds", () => {
    const highway = buildFromMaster({
      vehicleType: "truck",
      brakeSystem: "air_brake",
      dutyClass: "heavy",
      targetCount: 120,
    });

    expect(
      highway.some((section) => section.title.startsWith("Off-Road —")),
    ).toBe(false);
  });
});
