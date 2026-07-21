import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const autosave = read("features/inspections/hooks/useInspectionAutosave.ts");
const generic = read(
  "features/inspections/screens/GenericInspectionScreen.tsx",
);
const quickScreens = [
  read("features/inspections/screens/QuickPMScreen.tsx"),
  read("features/inspections/screens/QuickAirBrakePMScreen.tsx"),
];

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

  it("boots each quick screen under its exact draft identity", () => {
    for (const screen of quickScreens) {
      expect(screen).toContain(
        "const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null);",
      );
      expect(screen).toContain(
        "const draftReady = draftBootLoaded && loadedDraftKey === draftKey;",
      );
      expect(screen).toContain("enabled: draftReady,");
      expect(screen).toContain("hydrated: serverBootLoaded,");
      expect(screen).toContain(
        "const inspectionReady = draftReady && serverBootLoaded;",
      );
      expect(screen).toContain("setDraftBootLoaded(false);");
      expect(screen).toContain("setLoadedDraftKey(null);");
      expect(screen).toContain("setLoadedDraftKey(draftKey);");
      expect(screen).toContain("if (!draftReady) return;");
      expect(screen).toContain("disabled={isLocked || !inspectionReady}");
      expect(screen).toContain("recoveryOperationKey,");
      expect(screen).toContain("durableDraft?.operationKey");
    }
  });

  it("applies realtime locks synchronously and stops voice mutations", () => {
    for (const screen of quickScreens) {
      const applyStart = screen.indexOf(
        "const applyLockedState = (nextLocked: boolean): void => {",
      );
      const refUpdate = screen.indexOf(
        "isLockedRef.current = nextLocked;",
        applyStart,
      );
      const stateUpdate = screen.indexOf("setIsLocked(nextLocked);", applyStart);
      expect(applyStart).toBeGreaterThan(-1);
      expect(refUpdate).toBeGreaterThan(applyStart);
      expect(stateUpdate).toBeGreaterThan(refUpdate);
      expect(screen).toContain("if (nextLocked) stopRecognition();");
      expect(screen).toContain(
        "if (draftReadyRef.current && !isLockedRef.current)",
      );
      expect(screen).toContain(
        "onRemoteMeta: (meta) => applyLockedState(meta.locked),",
      );
    }
  });
});
