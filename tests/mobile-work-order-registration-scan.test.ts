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
    expect(page).toContain("first_name: result.customer.first_name");
    expect(page).toContain("license_plate: result.vehicle.license_plate");
    expect(page).toContain("vin: result.vehicle.vin");
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
