import { describe, expect, it } from "vitest";
import {
  emptyOwnerEnabled,
  evaluateAutomationReadiness,
  isAutomationCapabilityEffective,
  isMissingAutomationPolicySchemaError,
} from "./automationPolicy";

describe("AI automation policy", () => {
  it("defaults every executable capability to owner-disabled", () => {
    expect(Object.values(emptyOwnerEnabled()).every((value) => value === false)).toBe(true);
  });

  it("does not treat observational history as automation proof", () => {
    const readiness = evaluateAutomationReadiness({
      capability: "parts_ordering",
      evidence: Array.from({ length: 100 }, () => ({ capability: "parts_ordering", outcome: "observed" })),
    });
    expect(readiness.status).toBe("learning");
    expect(readiness.comparisonCount).toBe(0);
  });

  it("requires enough accurate shadow comparisons", () => {
    const readiness = evaluateAutomationReadiness({
      capability: "parts_ordering",
      evidence: [
        ...Array.from({ length: 75 }, () => ({ capability: "parts_ordering", outcome: "observed" })),
        ...Array.from({ length: 40 }, () => ({ capability: "parts_ordering", outcome: "matched" })),
      ],
    });
    expect(readiness.status).toBe("ready");
    expect(readiness.readinessPercent).toBe(100);
  });

  it("suspends readiness after a critical failure", () => {
    const readiness = evaluateAutomationReadiness({
      capability: "appointment_intake",
      evidence: [
        ...Array.from({ length: 100 }, () => ({ capability: "appointment_intake", outcome: "matched" })),
        { capability: "appointment_intake", outcome: "critical_failure" },
      ],
    });
    expect(readiness.status).toBe("suspended");
  });

  it("requires all execution gates", () => {
    expect(isAutomationCapabilityEffective({ automationPaused: false, ownerEnabled: true, readinessStatus: "ready", executionAvailable: true })).toBe(true);
    expect(isAutomationCapabilityEffective({ automationPaused: true, ownerEnabled: true, readinessStatus: "ready", executionAvailable: true })).toBe(false);
    expect(isAutomationCapabilityEffective({ automationPaused: false, ownerEnabled: false, readinessStatus: "ready", executionAvailable: true })).toBe(false);
    expect(isAutomationCapabilityEffective({ automationPaused: false, ownerEnabled: true, readinessStatus: "learning", executionAvailable: true })).toBe(false);
    expect(isAutomationCapabilityEffective({ automationPaused: false, ownerEnabled: true, readinessStatus: "ready", executionAvailable: false })).toBe(false);
  });

  it("recognizes rolling-deploy missing schema responses", () => {
    expect(isMissingAutomationPolicySchemaError({ code: "PGRST205", message: "Could not find ai_automation_evidence in the schema cache" })).toBe(true);
  });
});
