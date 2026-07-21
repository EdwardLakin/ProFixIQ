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
const sectionDisplay = readFileSync(
  "features/inspections/lib/inspection/SectionDisplay.tsx",
  "utf8",
);
const genericScreen = readFileSync(
  "features/inspections/screens/GenericInspectionScreen.tsx",
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
    expect(boardHook).toContain('overall_stage: "in_progress"');
    expect(boardHook).toContain('table: "work_order_line_labor_segments"');
  });

  it("offers an explicit no-parts-required inspection choice", () => {
    expect(sectionDisplay).toContain("No parts required");
    expect(sectionDisplay).toContain("Blank parts also skip Parts workflow.");
    expect(sectionDisplay).toContain("onUpdateNoPartsRequired");
    expect(genericScreen).toContain("noPartsRequired: value");
  });

  it("starts Parts only from technician-entered valid parts", () => {
    expect(genericScreen).toContain(
      "parts: noPartsRequired\n                ? []\n                : cleanParts.map",
    );
    expect(quoteHelper).toContain(
      'status: hasParts ? "pending_parts" : "advisor_pending"',
    );
    expect(quoteHelper).toContain("no_parts_required: !hasParts");
    expect(
      genericScreen.match(/\/api\/parts\/requests\/create/g) ?? [],
    ).toHaveLength(1);
  });

  it("stores the canonical quote-line identity for new findings", () => {
    expect(genericScreen).toContain(
      "createdQuoteLineId = createdId ? String(createdId) : null",
    );
    expect(genericScreen).toContain(
      "estimateQuoteLineId: createdQuoteLineId ?? quoteId",
    );
    expect(autosaveHook).toContain(
      "Saved to shop • syncs across devices",
    );
  });
});

