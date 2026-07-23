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
    expect(screen).toContain("replaceSession(recovered.session)");
    expect(screen).toContain("recoveryOperationKey:");
    expect(screen).toContain("!draftBootLoaded ||");
    expect(screen).toContain("!serverBootLoaded ||");
    expect(screen).not.toContain("localDraftUpdatedAtRef");
    expect(screen).not.toContain("localStorage");
    expect(autosave).toContain("remoteShouldReplace");
    expect(autosave).toContain("hasMeaningfulLocalChanges");
    expect(autosave).toContain("recoveryOperationKey?.trim()");
  });

  it("preserves queued device evidence until a replacement is acknowledged", () => {
    expect(screen).toContain("saveInspectionOfflineDraft");
    expect(screen).toContain("queuedSessionRef.current !== session");
    expect(screen).toContain('draftState = "editing"');
    expect(screen).toContain("operationKey = undefined");
    expect(screen).toContain("state: draftState");
    expect(drafts).not.toContain("newestLocalTimestamp");
    expect(drafts).not.toContain("dismissOfflineMutation");
    expect(drafts).toContain("session: queuedSession ?? draft.session");
    expect(screen).not.toContain("newerSessionHint");

    const queueRun = save.indexOf(
      "const result = await runMutationWithOfflineQueue",
    );
    const dismissSuperseded = save.lastIndexOf(
      "await dismissOfflineMutation(supersededKey)",
    );
    expect(queueRun).toBeGreaterThan(-1);
    expect(dismissSuperseded).toBeGreaterThan(queueRun);
    expect(save).toContain("serverResponse.current");
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

  it("clears the durable recovery draft from the mounted findings flow", () => {
    expect(screen).toContain('window.addEventListener("inspection:completed"');
    expect(screen).toContain("inspectionCompletedRef.current = true");
    expect(findings).toContain("await removeInspectionOfflineDraft");
    expect(findings).not.toContain("localStorage");
    expect(findings.indexOf("await removeInspectionOfflineDraft")).toBeLessThan(
      findings.indexOf('new CustomEvent("inspection:completed"'),
    );
    expect(screen).not.toContain("<SaveInspectionButton");
    expect(autosave).toContain("saveInspectionOfflineDraft");
    expect(save).toContain("operationKey,");
    expect(save).toContain("syncRevision: serverResponse.current?.sync_revision");
  });

  it("pauses conflicts without destructive override or priority merging", () => {
    expect(screen).not.toContain("<InspectionConflictRecoveryPanel");
    expect(screen).toContain('recovered.state === "conflicted"');
    expect(autosave).not.toContain("const resolveConflict = useCallback");
    expect(autosave).not.toContain("automaticallyMergeInspectionConflict");
    expect(autosave).toContain("Sync paused · device copy protected");
    expect(screen).toContain("It has not replaced the shop copy");
    expect(save).toContain("until its replacement is acknowledged");
  });
});
