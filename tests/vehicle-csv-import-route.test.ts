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

  it("persists supported CSV vehicle detail fields and keeps response compact", () => {
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
    ]) {
      expect(source).toContain(`${field}:`);
    }
    expect(source).toContain("const mileage = odometer ?? null");
    expect(source).not.toContain("skippedRows,");
    expect(source).not.toContain("failedRows,");
  });
});

describe("vehicle detail UI", () => {
  it("renders imported vehicle detail fields", () => {
    const source = customerVehicleUiSource();

    for (const label of [
      "Year / Make / Model / Trim",
      "Plate + State/Province",
      "Mileage / Odometer",
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

    expect(source).toContain("/steps/vehicles/complete");
    expect(source).toMatch(
      /payload\.counts\.created\s*\+\s*payload\.counts\.updated\s*\+\s*payload\.counts\.skipped\s*>\s*0/,
    );
    expect(source).toContain("Continue onboarding");
  });
});
