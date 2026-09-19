import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/mobile/work-orders/create/page.tsx", "utf8");

describe("mobile work-order registration scan", () => {
  it("reuses the canonical shop registration scan flow", () => {
    expect(page).toContain("RegistrationScanModal");
    expect(page).toContain("Scan registration");
    expect(page).toContain("RegistrationScanApplyResult");
  });

  it("applies scanned customer and vehicle identity to the mobile create form", () => {
    expect(page).toContain("customerFields.first_name =");
    expect(page).toContain("result.customer.first_name ?? null");
    expect(page).toContain("vehicleFields.license_plate =");
    expect(page).toContain("result.vehicle.license_plate ?? null");
    expect(page).toContain("vehicleFields.vin = result.vehicle.vin ?? null");
  });

  it("stores the reviewed registration image on the resolved vehicle", () => {
    expect(page).toContain("uploadVehicleMediaFile");
    expect(page).toContain('bucket: "vehicle-docs"');
    expect(page).toContain('type: "document"');
    expect(page).toContain("pendingRegistrationContext");
  });

  it("keeps VIN scan as a separate fast path", () => {
    expect(page).toContain("Scan VIN");
    expect(page).toContain("VinCaptureModal");
  });
});
