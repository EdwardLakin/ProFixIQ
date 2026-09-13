import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const createPage = readFileSync(
  "features/work-orders/app/work-orders/create/page.tsx",
  "utf8",
);
const modal = readFileSync(
  "features/vehicles/components/RegistrationScanModal.tsx",
  "utf8",
);
const scanClient = readFileSync(
  "features/work-orders/intake/capture/scanRegistration.ts",
  "utf8",
);
const ocrRoute = readFileSync("app/api/ocr/registration/route.ts", "utf8");

describe("create work order registration scan", () => {
  it("adds a Scan Registration entry point next to the existing Scan VIN button", () => {
    expect(createPage).toContain("<RegistrationScanModal");
    expect(createPage).toContain("Scan Registration");
    expect(createPage).toContain("Scan VIN");
  });

  it("applies accepted fields to the existing customer/vehicle draft rather than a separate form", () => {
    expect(createPage).toContain("onApply={(result: RegistrationScanApplyResult) => {");
    expect(createPage).toContain("setCustomer((prev) => ({ ...prev, ...result.customer }))");
    expect(createPage).toContain("setVehicle((prev) => ({ ...prev, ...decodedVehicle }))");
    expect(createPage).toContain("cvDraft.bulkSet({ customer: result.customer })");
  });

  it("saves the captured registration photo to the vehicle's document record once the vehicle is resolved", () => {
    expect(createPage).toContain("pendingRegistrationFile");
    expect(createPage).toContain("const veh = await ensureVehicleRow(cust, shopId);");
    const afterVehicleResolved = createPage.slice(
      createPage.indexOf("const veh = await ensureVehicleRow(cust, shopId);"),
    );
    expect(afterVehicleResolved.indexOf("pendingRegistrationFile")).toBeGreaterThan(-1);
    expect(afterVehicleResolved).toContain('bucket: "vehicle-docs"');
    expect(afterVehicleResolved).toContain('type: "document"');
    expect(createPage).toContain("setPendingRegistrationFile(null)");
  });

  it("clears any pending scan when the form is cleared", () => {
    const clearFn = createPage.slice(
      createPage.indexOf("const handleClearForm = useCallback"),
      createPage.indexOf("}, [", createPage.indexOf("const handleClearForm = useCallback")),
    );
    expect(clearFn).toContain("setPendingRegistrationFile(null)");
  });

  it("never silently overwrites a field that already differs in the form", () => {
    expect(modal).toContain("nextAccepted[`customer.${key}`] =");
    expect(modal).toContain("!currentValue || currentValue === value");
    expect(modal).toContain("Current value:");
  });

  it("lets the advisor review and deselect fields before anything is applied", () => {
    expect(modal).toContain("type=\"checkbox\"");
    expect(modal).toContain("onApply({ customer, vehicle, file })");
  });

  it("reads the document via multipart directly against the existing OCR endpoint (no throwaway storage upload)", () => {
    expect(scanClient).toContain('fetch("/api/ocr/registration"');
    expect(scanClient).toContain("formData.append(\"file\"");
    expect(ocrRoute).toContain('multipart/form-data');
  });

  it("normalizes and flags an invalid VIN instead of silently dropping it", () => {
    expect(scanClient).toContain("normalizeVinInput(raw.vin)");
    expect(scanClient).toContain("didn't pass validation");
  });
});
