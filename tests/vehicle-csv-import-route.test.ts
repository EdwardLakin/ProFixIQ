import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = () =>
  readFileSync("app/api/vehicles/import/route.ts", "utf8");
const cardSource = () =>
  readFileSync("features/vehicles/components/VehicleCsvImportCard.tsx", "utf8");
const customerVehicleUiSource = () =>
  readFileSync("features/customers/app/customers/[id]/page.tsx", "utf8");

describe("vehicle CSV import route", () => {
  it("resolves CSV customer_id through customers.external_id before assigning vehicles.customer_id", () => {
    const source = routeSource();

    expect(source).toContain("byExternalId: Map<string, string>");
    expect(source).toContain(
      'select("id, external_id, email, phone, phone_number, name, business_name")',
    );
    expect(source).toContain("customers.byExternalId.get(externalCustomerId)");
    expect(source).toContain("customer_id: customerId");
    expect(source).not.toContain("customer_id: cleanString(row.customer_id)");
  });

  it("skips unresolved external customer ids instead of failing the whole import", () => {
    const source = routeSource();

    expect(source).toContain(
      'reason: "Customer not found for external customer_id."',
    );
    expect(source).toContain("counts.skipped += 1");
    expect(source).toContain('console.warn("Vehicle import row failed"');
  });

  it("matches re-imported vehicles without relying on duplicate insert conflicts", () => {
    const source = routeSource();

    expect(source).toContain(
      '"external_id" | "vin" | "unit_number" | "license_plate"',
    );
    expect(source).toContain("findVehicleByField");
    expect(source).toContain(".limit(1)");
    expect(source).toContain("counts.updated += 1");
  });

  it("persists supported CSV vehicle detail fields and returns compact diagnostics", () => {
    const source = routeSource();

    for (const field of [
      "state_province",
      "odometer_unit",
      "body_type",
      "asset_type",
      "status",
      "purchase_date",
      "in_service_date",
      "last_service_date",
      "tags",
      "notes",
      "drivetrain",
      "submodel",
    ]) {
      expect(source).toContain(`${field}:`);
    }
    expect(source).toContain("const mileage = odometer ?? null");
    expect(source).toContain("skippedRows,");
    expect(source).toContain("failedRows,");
  });
});

describe("vehicle detail UI", () => {
  it("renders imported vehicle detail fields", () => {
    const source = customerVehicleUiSource();

    expect(source).toContain("formatOdometer");
    expect(source).toContain("formatPlateWithRegion");
    expect(source).toContain("Customer since");
    expect(source).toContain("compactDate(customer?.customer_since ?? customer?.created_at)");
    expect(source).toContain("🚗");

    for (const label of [
      "Plate",
      "Mileage",
      "Engine",
      "Drive",
      "Body Type",
      "Asset Type",
      "Purchase Date",
      "In-Service Date",
      "Last Service Date",
      "Tags",
      "Notes",
    ]) {
      expect(source).toContain(label);
    }
  });
});

describe("vehicle CSV import card", () => {
  it("can complete guided onboarding after a non-fatal vehicle import", () => {
    const source = cardSource();

    expect(source).toContain("state_province");
    expect(source).toContain("body_type");
    expect(source).toContain("last_service_date");
    expect(source).toContain("/steps/vehicles/complete");
    expect(source).toMatch(
      /payload\.counts\.created\s*\+\s*payload\.counts\.updated\s*\+\s*payload\.counts\.skipped\s*>\s*0/,
    );
    expect(source).toContain("Continue onboarding");
  });
});
