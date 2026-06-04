import { describe, expect, it } from "vitest";
import { previewVehicleCsv } from "@/features/vehicles/lib/importCsv";

describe("vehicle CSV preview", () => {
  it("parses common aliases and counts valid rows", () => {
    const preview = previewVehicleCsv("unit #,serial,plate number,year,make,model,customer email\nA-1,1hgcm82633a004352,abc123,2021,Ford,F-150,jane@example.com", [
      { id: "customer-1", email: "jane@example.com" },
    ]);

    expect(preview.rowCount).toBe(1);
    expect(preview.validCount).toBe(1);
    expect(preview.rows[0]).toMatchObject({ unit_number: "A-1", vin: "1HGCM82633A004352", license_plate: "ABC123", resolvedCustomerId: "customer-1" });
  });

  it("shows invalid rows and unlinked customer warnings before import", () => {
    const preview = previewVehicleCsv("unit,vin,customer name\n,,Missing Customer\nA-1,1HGCM82633A004352,\nA-1,1HGCM82633A004352,", []);

    expect(preview.invalidCount).toBe(1);
    expect(preview.rows[0].errors.join(" ")).toMatch(/VIN, unit number, license plate/i);
    expect(preview.rows[0].warnings.join(" ")).toMatch(/without a customer link/i);
    expect(preview.duplicateWarnings).toBe(2);
  });
});
