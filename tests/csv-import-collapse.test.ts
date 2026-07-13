import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("collapsible CSV import cards", () => {
  it("centralizes compact collapse state and accessibility in a shared shell", () => {
    const source = read("features/shared/components/import/CollapsibleCsvImportCard.tsx");

    expect(source).toContain("shouldAutoExpand");
    expect(source).toContain("guidedActive");
    expect(source).toContain("hasSelectedFile");
    expect(source).toContain("isParsing");
    expect(source).toContain("isImporting");
    expect(source).toContain("hasValidationIssues");
    expect(source).toContain("hasImportResult");
    expect(source).toContain("aria-expanded={expanded}");
    expect(source).toContain("aria-controls={contentId}");
    expect(source).toContain("CSV import");
  });

  it("keeps operational customer and vehicle import cards compact until file or lifecycle state exists", () => {
    const customer = read("features/customers/components/CustomerCsvImportCard.tsx");
    const vehicle = read("features/vehicles/components/VehicleCsvImportCard.tsx");

    expect(customer).toContain("CollapsibleCsvImportCard");
    expect(customer).toContain("compactDescription=\"Add or update customer records in bulk.\"");
    expect(customer).toContain("hasSelectedFile={Boolean(fileName)}");
    expect(customer).toContain("hasImportResult={Boolean(counts || skippedRows.length || failedRows.length || importProgress)}");
    expect(vehicle).toContain("CollapsibleCsvImportCard");
    expect(vehicle).toContain("compactDescription=\"Add or update vehicle records in bulk.\"");
    expect(vehicle).toContain("hasSelectedFile={Boolean(fileName)}");
    expect(vehicle).toContain("Choose CSV file");
  });

  it("collapses invoice, parts, and history layouts outside guided onboarding while preserving guided expansion", () => {
    const layout = read("features/shared/components/import/GuidedImportCardLayout.tsx");
    const invoice = read("features/billing/components/InvoiceCsvImportCard.tsx");
    const parts = read("app/parts/inventory/page.tsx");
    const history = read("features/work-orders/components/VehicleHistoryCsvImportCard.tsx");

    expect(layout).toContain("CollapsibleCsvImportCard");
    expect(invoice).toContain("guidedActive={isOnboarding}");
    expect(invoice).toContain("compactDescription=\"Add historical invoice records in bulk.\"");
    expect(parts).toContain("guidedActive={guidedQuery?.onboardingStep === \"parts\"}");
    expect(parts).toContain("compactDescription=\"Add or update parts inventory records in bulk.\"");
    expect(history).toContain("guidedActive={isOnboarding}");
    expect(history).toContain("compactDescription=\"Add historical service records in bulk.\"");
  });
});
