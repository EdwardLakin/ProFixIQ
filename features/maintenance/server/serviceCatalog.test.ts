import { describe, expect, it } from "vitest";
import {
  canonicalizeServiceCode,
  descriptionMatchesService,
} from "./serviceCatalog";

describe("canonicalizeServiceCode", () => {
  it("keeps catalog codes and maps generated names onto them", () => {
    expect(canonicalizeServiceCode("OIL_CHANGE")).toBe("OIL_CHANGE");
    expect(canonicalizeServiceCode("ENGINE_OIL_FILTER", "Engine oil & filter change")).toBe("OIL_CHANGE");
    expect(canonicalizeServiceCode("rotate", "Rotate tires")).toBe("TIRE_ROTATION");
    expect(canonicalizeServiceCode("BRAKE_FLUID", "Brake fluid flush")).toBe("BRAKE_FLUID_FLUSH");
  });

  it("prefers the most specific name", () => {
    expect(canonicalizeServiceCode("X", "Replace cabin air filter")).toBe("CABIN_AIR_FILTER");
    expect(canonicalizeServiceCode("X", "Replace engine air filter")).toBe("ENGINE_AIR_FILTER");
  });

  it("leaves services outside the catalog as normalized codes", () => {
    expect(canonicalizeServiceCode("king pin grease", "King pin lubrication")).toBe("KING_PIN_GREASE");
  });
});

describe("descriptionMatchesService", () => {
  it("matches shop shorthand to the catalog service", () => {
    expect(descriptionMatchesService("LOF - 5W30", "OIL_CHANGE", "Engine oil & filter change")).toBe(true);
    expect(descriptionMatchesService("Rotate tyres", "TIRE_ROTATION", "Tire rotation")).toBe(true);
    expect(descriptionMatchesService("CVIP annual", "SAFETY_INSPECTION", "Annual safety inspection")).toBe(true);
  });

  it("does not count a different service", () => {
    expect(descriptionMatchesService("Cabin air filter", "ENGINE_AIR_FILTER", "Engine air filter replacement")).toBe(false);
    expect(descriptionMatchesService("Brake fluid flush", "BRAKE_INSPECTION", "Brake inspection and adjustment")).toBe(false);
    expect(descriptionMatchesService("Diagnose no start", "OIL_CHANGE", "Engine oil & filter change")).toBe(false);
  });
});
