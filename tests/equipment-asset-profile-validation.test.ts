import { describe, expect, it } from "vitest";

import {
  ASSET_EQUIPMENT_CLASS_OPTIONS,
  validateEquipmentAssetProfileMutation,
} from "@/features/equipment/lib/assetProfile";

const ASSET_ID = "00000000-0000-4000-8000-000000000001";
const HOST_ID = "00000000-0000-4000-8000-000000000002";

describe("Equipment asset profile validation", () => {
  it("derives the family from the canonical class catalog, ignoring client input", () => {
    const result = validateEquipmentAssetProfileMutation(
      { equipmentClass: "crawler_excavator", equipmentFamily: "forestry" },
      ASSET_ID,
    );
    expect(result.ok && result.value.equipmentFamily).toBe("excavation");
    expect(result.ok && result.value.primaryMeter).toBe("hours");
    expect(result.ok && result.value.operatingStatus).toBe("operational");
  });

  it("rejects an unknown equipment class", () => {
    expect(
      validateEquipmentAssetProfileMutation({ equipmentClass: "spaceship" }, ASSET_ID).ok,
    ).toBe(false);
  });

  it("rejects mounting an asset on itself and malformed host ids", () => {
    expect(
      validateEquipmentAssetProfileMutation(
        { equipmentClass: "attachment", mountedOnAssetId: ASSET_ID },
        ASSET_ID,
      ).ok,
    ).toBe(false);
    expect(
      validateEquipmentAssetProfileMutation(
        { equipmentClass: "attachment", mountedOnAssetId: "not-a-uuid" },
        ASSET_ID,
      ).ok,
    ).toBe(false);
    const ok = validateEquipmentAssetProfileMutation(
      { equipmentClass: "attachment", mountedOnAssetId: HOST_ID },
      ASSET_ID,
    );
    expect(ok.ok && ok.value.mountedOnAssetId).toBe(HOST_ID);
  });

  it("validates meters and only includes canonical meters when supplied", () => {
    expect(
      validateEquipmentAssetProfileMutation(
        { equipmentClass: "wheel_loader", engineHours: -1 },
        ASSET_ID,
      ).ok,
    ).toBe(false);
    expect(
      validateEquipmentAssetProfileMutation(
        { equipmentClass: "wheel_loader", currentCycles: 1.5 },
        ASSET_ID,
      ).ok,
    ).toBe(false);

    const omitted = validateEquipmentAssetProfileMutation(
      { equipmentClass: "wheel_loader" },
      ASSET_ID,
    );
    expect(omitted.ok && "engineHours" in omitted.value).toBe(false);

    const supplied = validateEquipmentAssetProfileMutation(
      { equipmentClass: "wheel_loader", engineHours: "4210.5", odometer: 1200, currentCycles: 30 },
      ASSET_ID,
    );
    expect(supplied.ok && supplied.value.engineHours).toBe(4210.5);
    expect(supplied.ok && supplied.value.odometer).toBe("1200");
    expect(supplied.ok && supplied.value.currentCycles).toBe(30);
  });

  it("accepts flat scalar attributes and rejects nested or badly named ones", () => {
    expect(
      validateEquipmentAssetProfileMutation(
        { equipmentClass: "crawler_dozer", attributes: { blade_type: "SU", ripper: true, weight_kg: 38000 } },
        ASSET_ID,
      ).ok,
    ).toBe(true);
    expect(
      validateEquipmentAssetProfileMutation(
        { equipmentClass: "crawler_dozer", attributes: { nested: { a: 1 } } },
        ASSET_ID,
      ).ok,
    ).toBe(false);
    expect(
      validateEquipmentAssetProfileMutation(
        { equipmentClass: "crawler_dozer", attributes: { "Bad Key": "x" } },
        ASSET_ID,
      ).ok,
    ).toBe(false);
  });

  it("rejects unknown status/meter and over-long text", () => {
    expect(
      validateEquipmentAssetProfileMutation(
        { equipmentClass: "crawler_dozer", operatingStatus: "flying" },
        ASSET_ID,
      ).ok,
    ).toBe(false);
    expect(
      validateEquipmentAssetProfileMutation(
        { equipmentClass: "crawler_dozer", primaryMeter: "furlongs" },
        ASSET_ID,
      ).ok,
    ).toBe(false);
    expect(
      validateEquipmentAssetProfileMutation(
        { equipmentClass: "crawler_dozer", serialNumber: "x".repeat(121) },
        ASSET_ID,
      ).ok,
    ).toBe(false);
  });

  it("offers every canonical off-road class", () => {
    expect(ASSET_EQUIPMENT_CLASS_OPTIONS.length).toBeGreaterThan(40);
    expect(ASSET_EQUIPMENT_CLASS_OPTIONS.map((option) => option.value)).toContain("attachment");
  });
});
