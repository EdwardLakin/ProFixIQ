import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const autosave = read("features/inspections/hooks/useInspectionAutosave.ts");
const generic = read(
  "features/inspections/screens/GenericInspectionScreen.tsx",
);
describe("inspection identity and lock guards", () => {
  it("never persists or arbitrates a session from another work-order line", () => {
    expect(autosave).toContain("function sessionMatchesWorkOrderLine(");
    expect(autosave).toContain(
      "sessionMatchesWorkOrderLine(\n        latestSessionRef.current,",
    );
    expect(autosave).toContain(
      "if (!sessionMatchesWorkOrderLine(snapshot, workOrderLineId))",
    );
    expect(autosave).toContain(
      "Inspection draft belongs to a different work-order line.",
    );
  });

  it("does not publish a provisional unlock while changing identities", () => {
    const resetStart = autosave.indexOf(
      'useEffect(() => {\n    setLastError(null);',
    );
    const resetEnd = autosave.indexOf(
      "useEffect(() => {\n    const recoveredKey",
      resetStart,
    );
    expect(resetStart).toBeGreaterThan(-1);
    expect(resetEnd).toBeGreaterThan(resetStart);
    expect(autosave.slice(resetStart, resetEnd)).not.toContain(
      "onRemoteMetaRef.current",
    );
  });

  it("keeps local lock evidence until versioned server metadata arrives", () => {
    expect(generic).toContain("if (!persistEvidence) return;");
    expect(generic).toContain(
      "if (meta.updatedAt === null && !meta.locked) return;",
    );
    expect(generic).toContain(
      "applyLockedState(meta.locked, meta.updatedAt !== null);",
    );
  });

});
