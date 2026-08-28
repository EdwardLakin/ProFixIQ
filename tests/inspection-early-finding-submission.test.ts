import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("inspection early finding submission", () => {
  it("uses a saved revision and the canonical atomic quote import", () => {
    const screen = read(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );
    const route = read("app/api/work-orders/import-from-inspection/route.ts");

    expect(screen).toContain("await flushAutosaveToServer()");
    expect(screen).toContain("expectedSyncRevision");
    expect(screen).toContain("findingSelection: selection");
    expect(screen).not.toContain("autoGenerateParts");
    expect(route).toContain("findingSelection");
    expect(route).toContain("inspection.sync_revision");
    expect(route).toContain("insertPrioritizedJobsFromInspection({");
  });

  it("accepts only saved failed or recommended findings with complaint notes", () => {
    const route = read("app/api/work-orders/import-from-inspection/route.ts");

    expect(route).toContain('status !== "fail" && status !== "recommend"');
    expect(route).toContain("Only saved failed or recommended findings");
    expect(route).toContain("Add a note for ${title} before submitting.");
  });

  it("filters the canonical import to selected findings and reuses submitted line ids", () => {
    const importer = read(
      "features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection.ts",
    );

    expect(importer).toContain("selectedFindingKeys");
    expect(importer).toContain(
      "!selectedFindingKeys.has(`${sectionIndex}:${itemIndex}`)",
    );
    expect(importer).toContain(
      "id: safeString(item.estimateQuoteLineId) || null",
    );
    expect(importer).not.toContain("estimateLabor(");
    expect(importer).not.toContain("Auto-generated from inspection");
    expect(importer).toContain('rpc("import_inspection_quote_package_atomic"');
  });

  it("persists the server line id and keeps signing as the final lock action", () => {
    const screen = read(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );
    const signature = read(
      "features/inspections/components/inspection/InspectionSignaturePanel.tsx",
    );

    expect(screen).toContain("estimateQuoteLineId: quoteLineIds[index]");
    expect(screen).toContain("await flushAutosaveToServer(nextSession)");
    expect(screen).toContain("The inspection stays open until it is signed.");
    expect(signature).toContain(
      "any remaining failed and recommended findings",
    );
  });
});
