import { describe, expect, it } from "vitest";

import {
  masterInspectionList,
  highwayMasterInspectionList,
  buildFromMaster,
} from "@/features/inspections/lib/inspection/masterInspectionList";
import {
  buildOffRoadFromMaster,
  offRoadCategoriesForFamily,
  offRoadCategoriesForProfile,
  offRoadProfileByValue,
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

  it("builds a focused equipment-specific off-road inspection", () => {
    const built = buildOffRoadFromMaster({
      profileValue: "crawler_excavator",
      targetCount: 30,
    });

    const items = built.flatMap((section) =>
      section.items.map((entry) => entry.item),
    );

    expect(items.length).toBeGreaterThanOrEqual(30);
    expect(items).toContain("Swing bearing / swing play");
    expect(
      built.every((section) =>
        section.items.every((entry) =>
          entry.equipmentFamilies.includes("excavation"),
        ),
      ),
    ).toBe(true);
  });

  it("returns no sections for an unknown off-road profile", () => {
    expect(
      buildOffRoadFromMaster({
        profileValue: "unknown-machine",
        targetCount: 30,
      }),
    ).toEqual([]);
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

  it("keeps off-road rows out of the highway-only master list", () => {
    expect(
      highwayMasterInspectionList.some((section) =>
        section.title.startsWith("Off-Road —"),
      ),
    ).toBe(false);
    expect(
      highwayMasterInspectionList.every((section) =>
        section.items.every((entry) => entry.catalogScope !== "off_road"),
      ),
    ).toBe(true);
    expect(highwayMasterInspectionList.length).toBeGreaterThan(0);
  });

  it("gives every profile family at least one section and unique item names", () => {
    for (const profile of offRoadEquipmentProfiles) {
      expect(offRoadCategoriesForFamily(profile.family).length).toBeGreaterThan(0);
    }
    for (const section of offRoadInspectionCategories) {
      const names = section.items.map((entry) => entry.item);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  const itemsFor = (value: string) => {
    const profile = offRoadProfileByValue(value);
    if (!profile) throw new Error(`unknown profile ${value}`);
    return offRoadCategoriesForProfile(profile).flatMap((section) =>
      section.items.map((entry) => entry.item),
    );
  };

  it("keeps engine, coolant and ROPS rows off electric platforms", () => {
    for (const value of ["scissor_lift", "vertical_mast_lift"]) {
      const items = itemsFor(value);
      expect(items).not.toContain("Engine oil level / condition");
      expect(items).not.toContain("Coolant level / condition");
      expect(items).not.toContain("Fuel tank / lines / hoses");
      expect(items).not.toContain("ROPS / FOPS / cab structure");
    }
    expect(itemsFor("boom_lift")).toContain("Engine oil level / condition");
  });

  it("gives rubber-tyred underground and forestry machines tire checks", () => {
    for (const value of ["underground_lhd", "underground_haul_truck", "harvester_forwarder"]) {
      expect(itemsFor(value)).toContain("Tire condition — cuts / chunking / separation");
    }
    expect(itemsFor("underground_lhd")).not.toContain("Track shoes / grouser wear");
  });

  it("separates wheeled and tracked machines that share a family", () => {
    expect(itemsFor("wheel_loader")).not.toContain("Track shoes / grouser wear");
    expect(itemsFor("compact_track_loader")).toContain("Track shoes / grouser wear");
    expect(itemsFor("compact_track_loader")).not.toContain("Tire pressure");
    expect(itemsFor("wheeled_excavator")).toContain("Tire pressure");
    expect(itemsFor("wheeled_excavator")).not.toContain("Track shoes / grouser wear");
    expect(itemsFor("crawler_excavator")).toContain("Track shoes / grouser wear");
  });

  it("separates mast forklifts from boom handlers", () => {
    expect(itemsFor("forklift")).toContain("Lift chains / anchors / chain tension");
    expect(itemsFor("forklift")).not.toContain("Boom sections / wear pads / rollers");
    expect(itemsFor("telehandler")).toContain("Boom sections / wear pads / rollers");
    expect(itemsFor("telehandler")).not.toContain("Lift chains / anchors / chain tension");
    expect(itemsFor("telehandler")).toContain("Forks — heel / blade / tip wear");
  });

  it("gives every profile a non-empty, required-bearing build and attachments no pump rows", () => {
    for (const profile of offRoadEquipmentProfiles) {
      expect(itemsFor(profile.value).length).toBeGreaterThan(0);
    }
    expect(itemsFor("attachment")).not.toContain("Hydraulic pumps");
  });

  it("stores off-road profile values as valid fleet template vehicle types", () => {
    for (const profile of offRoadEquipmentProfiles) {
      expect(profile.value).toBe(profile.value.trim().toLowerCase());
      expect(profile.value.length).toBeLessThanOrEqual(80);
    }
  });
});
