import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const cornerGrid = read(
  "features/inspections/lib/inspection/ui/CornerGrid.tsx",
);
const sectionDisplay = read(
  "features/inspections/lib/inspection/SectionDisplay.tsx",
);
const autosave = read(
  "features/inspections/hooks/useInspectionAutosave.ts",
);
const signingRepair = read(
  "supabase/migrations/20260722113000_reinstall_inspection_save_and_sign.sql",
);
describe("premium inspection layout and signing repair", () => {
  it("renders the hydraulic corner grid without decorative empty cells or sketch copy", () => {
    expect(cornerGrid).toContain("Hydraulic brake measurements");
    expect(cornerGrid).toContain("md:grid-cols-2");
    expect(cornerGrid).not.toContain("spacer(body)");
    expect(cornerGrid).not.toContain("matches sketch");
    expect(cornerGrid).not.toContain('h-[110px]');
  });

  it("separates item counts from bulk status actions", () => {
    expect(sectionDisplay).toContain('aria-label="Section item counts"');
    expect(sectionDisplay).toContain('aria-label="Bulk section actions"');
    expect(sectionDisplay).toContain("Set section");
    expect(sectionDisplay).toContain("lg:grid-cols-[minmax(0,1fr)_auto]");
  });

  it("keeps corner-grid findings contextual without duplicate status inputs", () => {
    expect(sectionDisplay).toContain("hasGridFindingEvidence");
    expect(sectionDisplay).toContain("Finding details");
    expect(sectionDisplay).toContain("showStatusControls={!showGridFindings}");
    expect(sectionDisplay).not.toContain("Findings & evidence");
  });

  it("does not expose raw database conflict details to technicians", () => {
    expect(autosave).toContain(
      "Your work remains safe on this device.",
    );
    expect(autosave).toContain("inspectionSyncErrorMessage");
  });

  it("reinstalls conflict-safe save and revision-aware signing functions", () => {
    expect(signingRepair).toContain(
      "create or replace function public.save_inspection_progress_atomic",
    );
    expect(signingRepair).toContain(
      "create or replace function public.sign_inspection",
    );
    expect(signingRepair).toContain("p.user_id = v_actor_user_id");
    expect(signingRepair.toLowerCase()).not.toContain(
      "on conflict (work_order_line_id)",
    );
  });
});
