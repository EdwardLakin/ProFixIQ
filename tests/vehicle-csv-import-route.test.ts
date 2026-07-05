import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = () =>
  readFileSync("app/api/vehicles/import/route.ts", "utf8");
const cardSource = () =>
  readFileSync("features/vehicles/components/VehicleCsvImportCard.tsx", "utf8");

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
    expect(source).toContain("failedRows.push");
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
