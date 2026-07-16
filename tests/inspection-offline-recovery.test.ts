import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const drafts = read("features/inspections/lib/inspection/offlineDrafts.ts");
const screen = read("features/inspections/screens/GenericInspectionScreen.tsx");
const saveButton = read(
  "features/inspections/components/inspection/SaveInspectionButton.tsx",
);
const save = read("features/inspections/lib/inspection/save.ts");

describe("technician inspection offline recovery", () => {
  it("stores expiring drafts under the authenticated user and shop scope", () => {
    expect(drafts).toContain('const KIND = "inspection-draft"');
    expect(drafts).toContain("resolveOfflineMutationScope");
    expect(drafts).toContain("saveOfflineSnapshot");
    expect(drafts).toContain("MAX_AGE_MS");
    expect(drafts).toContain("entityId: args.draftKey");
  });

  it("hydrates the durable mutation queue before reconciling recovery state", () => {
    expect(drafts).toContain("await hydrateOfflineMutationQueue()");
    expect(drafts).toContain(
      "mutation.clientMutationId === draft.operationKey",
    );
    expect(drafts).toContain('queued.status === "conflicted"');
    expect(drafts).toContain('state: "editing" as const');
  });

  it("recovers before server boot and refuses to replace a newer device draft", () => {
    expect(screen).toContain("getInspectionOfflineDraft");
    expect(screen).toContain("if (!draftBootLoaded) return");
    expect(screen).toContain(
      "serverUpdatedAt >= localDraftUpdatedAtRef.current",
    );
    expect(screen).toContain("the older server copy was not applied");
    expect(screen).toContain("!draftBootLoaded ||");
  });

  it("persists edits, surfaces queued saves, and clears only on completion", () => {
    expect(screen).toContain("saveInspectionOfflineDraft");
    expect(screen).toContain("state: recoveryState");
    expect(screen).toContain("operationKey: recoveryOperationKeyRef.current");
    expect(screen).toContain('window.addEventListener("inspection:completed"');
    expect(screen).toContain("inspectionCompletedRef.current = true");
    expect(screen).toContain("removeInspectionOfflineDraft");
    expect(saveButton).toContain("? result.operationKey");
    expect(save).toContain("return { ...result, operationKey }");
  });
});
