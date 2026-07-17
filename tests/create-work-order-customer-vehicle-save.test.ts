import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("create work order customer and vehicle persistence", () => {
  const page = readFileSync(
    "features/work-orders/app/work-orders/create/page.tsx",
    "utf8",
  );

  it("writes the complete customer form for inserts and existing records", () => {
    expect(page).toContain("const customerWrite = buildCustomerInsert(customer, shopId)");
    expect(page).toContain("const { shop_id: _shopId, ...customerPatch } = customerWrite");
    expect(page).not.toContain("const needsPatch =");
    expect(page).toContain(".update(customerPatch)");
    expect(page).toContain(".update(buildImplicitCustomerPatch(customerPatch))");
    expect(page).toContain(".insert(customerWrite)");
  });

  it("writes every vehicle field, including cleared values", () => {
    const patchBuilder = page.slice(
      page.indexOf("const buildVehiclePatch"),
      page.indexOf("const hydrateCustomerFromRow"),
    );
    for (const field of [
      "vin",
      "year",
      "make",
      "model",
      "license_plate",
      "mileage",
      "unit_number",
      "color",
      "engine_hours",
      "engine",
      "submodel",
      "engine_family",
      "engine_type",
      "transmission",
      "transmission_type",
      "fuel_type",
      "drivetrain",
    ]) {
      expect(patchBuilder).toContain(`${field}:`);
    }
  });

  it("preserves blank fields when an implicit duplicate is reused", () => {
    expect(page).toContain(".update(buildImplicitVehiclePatch(vehicle, cust.id))");
    expect(page).toContain("buildImplicitCustomerPatch(customerPatch)");
    expect(page).toContain('key === "customer_id"');
    expect(page).toContain('.eq("customer_id", cust.id)');
  });

  it("blocks silently discarded VIN, year, and engine-hour values", () => {
    expect(page).toContain("validateVehicleSaveInput(vehicle)");
    expect(page).toContain("VIN must be a valid 17-character VIN before saving.");
    expect(page).toContain("Year must be between 1886");
    expect(page).toContain("Engine hours must be a positive number.");
  });

  it("verifies and rehydrates the values returned by the database", () => {
    expect(page.match(/assertWritePersisted\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(page).toContain("setCustomer(persistedCustomer)");
    expect(page).toContain("setVehicle(persistedVehicle)");
    expect(page).toContain("vehicle: persistedVehicle");
  });
});
