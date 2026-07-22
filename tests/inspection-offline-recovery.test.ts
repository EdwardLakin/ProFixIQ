import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const drafts = read("features/inspections/lib/inspection/offlineDrafts.ts");
const screen = read("features/inspections/screens/GenericInspectionScreen.tsx");
const autosave = read(
  "features/inspections/hooks/useInspectionAutosave.ts",
);
const save = read("features/inspections/lib/inspection/save.ts");
const findings = read("features/inspections/lib/inspection/findings/page.tsx");
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

  it("recovers before server hydration and preserves meaningful newer device edits", () => {
    expect(screen).toContain("getInspectionOfflineDraft");
    expect(screen).toContain("replaceSession(preferred)");
    expect(screen).toContain("recoveryOperationKey:");
    expect(screen).toContain("!draftBootLoaded ||");
    expect(screen).toContain("!serverBootLoaded ||");
    expect(screen).toContain("const localDraftUpdatedAtRef = useRef(0)");
    expect(autosave).toContain("remoteShouldReplace");
    expect(autosave).toContain("hasMeaningfulLocalChanges");
    expect(autosave).toContain("recoveryOperationKey?.trim()");
  });

  it("detaches newer edits from an older queued save", () => {
    expect(screen).toContain("saveInspectionOfflineDraft");
    expect(screen).toContain("queuedSessionRef.current !== session");
    expect(screen).toContain('draftState = "editing"');
    expect(screen).toContain("operationKey = undefined");
    expect(screen).toContain("state: draftState");
    expect(drafts).toContain("newestLocalTimestamp");
    expect(drafts).toContain("await dismissOfflineMutation(draft.operationKey)");
    expect(drafts).toContain("supersededMutation");
    expect(drafts).toContain('state: "editing" as const');
    expect(screen).toContain("newerSessionHint: persistedSession");
  });

  it("recovers a synced operation acknowledgement before issuing a newer revision", () => {
    expect(drafts).toContain('if (queued.status === "synced")');
    expect(drafts).toContain("awaitingAcknowledgement");
    expect(save).toContain(
      "!result.queued && !result.conflicted && !serverResponse.current",
    );
    expect(save).toContain("serverResponse.current = await postInspectionSave(payload)");
    expect(save).toContain("queued: true");
  });

  it("blocks findings edits while submission is in flight and preserves explicit no-parts decisions", () => {
    expect(findings).toContain("busyRef.current = true");
    expect(findings).toContain("assertSubmissionCurrent()");
    expect(findings).toContain("latestSessionRef.current");
    expect(findings).toContain("activeDraftKeyRef.current");
    expect(findings).toContain("const noPartsRequired =");
    expect(findings).toContain("no_parts_required: noPartsRequired");
    expect(findings).toContain("submissionFindings.length > 0");
    const finalizeResponseStart = findings.indexOf("const pdfJson =");
    const finalizeResponseCheck = findings.indexOf(
      "if (!pdfRes.ok || !pdfJson?.ok)",
      finalizeResponseStart,
    );
    expect(
      findings.slice(finalizeResponseStart, finalizeResponseCheck),
    ).not.toContain("assertSubmissionCurrent()");
  });

  it("clears durable and legacy drafts from the mounted findings flow", () => {
    expect(screen).toContain('window.addEventListener("inspection:completed"');
    expect(screen).toContain("inspectionCompletedRef.current = true");
    expect(findings).toContain("await removeInspectionOfflineDraft");
    expect(findings).toContain("localStorage.removeItem(draftKey)");
    expect(findings.indexOf("await removeInspectionOfflineDraft")).toBeLessThan(
      findings.indexOf('new CustomEvent("inspection:completed"'),
    );
    expect(screen).not.toContain("<SaveInspectionButton");
    expect(autosave).toContain("saveInspectionOfflineDraft");
    expect(save).toContain("operationKey,");
    expect(save).toContain("syncRevision: serverResponse.current?.sync_revision");
  });
});
