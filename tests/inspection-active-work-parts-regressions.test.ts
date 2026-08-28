import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const signRoute = readFileSync("app/api/inspections/sign/route.ts", "utf8");
const autosaveHook = readFileSync(
  "features/inspections/hooks/useInspectionAutosave.ts",
  "utf8",
);
const boardHook = readFileSync(
  "features/shared/hooks/useWorkOrderBoard.ts",
  "utf8",
);
const openPartsObligations = readFileSync(
  "features/parts/lib/open-parts-obligations.ts",
  "utf8",
);
const sectionDisplay = readFileSync(
  "features/inspections/lib/inspection/SectionDisplay.tsx",
  "utf8",
);
const genericScreen = readFileSync(
  "features/inspections/screens/GenericInspectionScreen.tsx",
  "utf8",
);
const canonicalImporter = readFileSync(
  "features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection.ts",
  "utf8",
);
const quoteHelper = readFileSync(
  "features/inspections/lib/inspection/addWorkOrderLine.ts",
  "utf8",
);

describe("active work and inspection parts regressions", () => {
  it("reads only real profile columns while signing", () => {
    expect(signRoute).toContain(
      "shop_id, full_name, tech_signature_path, tech_signature_hash",
    );
    expect(signRoute).not.toContain("first_name");
    expect(signRoute).not.toContain("last_name");
    expect(signRoute).toContain("user.user_metadata?.full_name");
  });

  it("treats an active labor segment as authoritative in-progress work", () => {
    expect(boardHook).toContain('"work_order_line_labor_segments"');
    expect(boardHook).toContain('.is("ended_at", null)');
    expect(boardHook).toContain("reconcileBoardPartsState");
    expect(openPartsObligations).toContain('overall_stage: "in_progress"');
    expect(boardHook).toContain('table: "work_order_line_labor_segments"');
  });

  it("offers an explicit no-parts-required inspection choice", () => {
    expect(sectionDisplay).toContain("No parts required");
    expect(sectionDisplay).toContain("Blank parts also skip Parts workflow.");
    expect(sectionDisplay).toContain("onUpdateNoPartsRequired");
    expect(genericScreen).toContain("noPartsRequired: value");
  });

  it("starts Parts only from technician-entered valid parts", () => {
    expect(canonicalImporter).toContain("const parts = itemParts(item)");
    expect(canonicalImporter).not.toContain("Auto-generated from inspection");
    expect(canonicalImporter).not.toContain("estimateLabor(");
    expect(quoteHelper).toContain(
      'status: hasParts ? "pending_parts" : "advisor_pending"',
    );
    expect(quoteHelper).toContain("no_parts_required: !hasParts");
    expect(
      genericScreen.match(/\/api\/parts\/requests\/create/g) ?? [],
    ).toHaveLength(0);
  });

  it("stores the canonical quote-line identity for new findings", () => {
    expect(genericScreen).toContain(
      "estimateQuoteLineId: quoteLineIds[index]",
    );
    expect(canonicalImporter).toContain(
      "id: safeString(item.estimateQuoteLineId) || null",
    );
    expect(autosaveHook).toContain(
      "Saved to shop • syncs across devices",
    );
  });
});
