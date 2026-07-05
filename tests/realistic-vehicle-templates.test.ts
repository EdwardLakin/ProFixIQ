import { describe, expect, it } from "vitest";
import { HEAVY_DUTY_VEHICLE_TEMPLATES, PASSENGER_VEHICLE_TEMPLATES } from "@/features/vehicles/lib/realisticVehicleTemplates";

describe("realistic vehicle templates", () => {
  it("keeps passenger templates internally consistent", () => {
    const requiredMakes = ["Toyota", "Ford", "Chevrolet", "GMC", "Ram", "Honda", "Nissan", "Hyundai", "Kia", "Mazda", "Subaru"];
    for (const make of requiredMakes) {
      expect(PASSENGER_VEHICLE_TEMPLATES.some((template) => template.make === make)).toBe(true);
    }

    for (const template of PASSENGER_VEHICLE_TEMPLATES) {
      expect(template.trims.length).toBeGreaterThan(0);
      expect(template.engines.length).toBeGreaterThan(0);
      expect(template.fuelTypes.length).toBeGreaterThan(0);
      expect(template.driveTypes.length).toBeGreaterThan(0);
      expect(template.bodyType).not.toBe("Heavy Truck");
      expect(template.mileageRange[0]).toBeLessThan(template.mileageRange[1]);
    }
  });

  it("generates heavy-duty candidates separately", () => {
    expect(HEAVY_DUTY_VEHICLE_TEMPLATES).toHaveLength(3);
    expect(HEAVY_DUTY_VEHICLE_TEMPLATES.every((template) => template.bodyType === "Heavy Truck")).toBe(true);
    expect(HEAVY_DUTY_VEHICLE_TEMPLATES.every((template) => template.fuelTypes.includes("Diesel"))).toBe(true);
  });
});
