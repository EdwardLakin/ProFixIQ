import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveTechnicianAssignmentContract } from "@/features/work-orders/lib/technicianAssignmentContract";

describe("PFX-004 technician assignment read contract", () => {
  it("uses a schema-valid inactive workforce fixture", () => {
    const runtime = readFileSync(
      "tests/security/technician-assignment-contract.runtime.sql",
      "utf8",
    );
    expect(runtime).toContain(
      "'72100000-0000-4000-8000-000000000004', 'inactive', false",
    );
    expect(runtime).not.toContain("'terminated', false");
  });

  it("keeps a newly created job explicitly unassigned", () => {
    expect(resolveTechnicianAssignmentContract({})).toEqual({
      primaryTechnicianId: null,
      technicianIds: [],
      supportingTechnicianIds: [],
      source: "unassigned",
      issues: [],
    });
  });

  it("uses the persisted primary and explicit supporting set", () => {
    expect(
      resolveTechnicianAssignmentContract({
        primaryTechnicianId: "tech-2",
        canonicalTechnicianIds: ["tech-1", "tech-2", "tech-1"],
      }),
    ).toEqual({
      primaryTechnicianId: "tech-2",
      technicianIds: ["tech-1", "tech-2"],
      supportingTechnicianIds: ["tech-1"],
      source: "canonical",
      issues: [],
    });
  });

  it("reads a legacy-only assignment without overriding canonical data", () => {
    expect(
      resolveTechnicianAssignmentContract({ legacyAssignedTo: "legacy-tech" }),
    ).toEqual({
      primaryTechnicianId: "legacy-tech",
      technicianIds: ["legacy-tech"],
      supportingTechnicianIds: [],
      source: "legacy_compatibility",
      issues: ["legacy_only_assignment"],
    });

    const conflict = resolveTechnicianAssignmentContract({
      primaryTechnicianId: "primary-tech",
      legacyAssignedTo: "legacy-tech",
      canonicalTechnicianIds: ["primary-tech", "supporting-tech"],
    });
    expect(conflict.primaryTechnicianId).toBe("primary-tech");
    expect(conflict.technicianIds).toEqual([
      "primary-tech",
      "supporting-tech",
    ]);
    expect(conflict.issues).toEqual([
      "legacy_primary_conflict",
      "legacy_set_conflict",
    ]);
  });

  it("reports ambiguous primary/set drift instead of choosing a replacement", () => {
    const noPrimary = resolveTechnicianAssignmentContract({
      canonicalTechnicianIds: ["tech-1", "tech-2"],
    });
    expect(noPrimary.primaryTechnicianId).toBeNull();
    expect(noPrimary.issues).toContain("canonical_set_without_primary");

    const missingPrimary = resolveTechnicianAssignmentContract({
      primaryTechnicianId: "tech-3",
      canonicalTechnicianIds: ["tech-1", "tech-2"],
    });
    expect(missingPrimary.primaryTechnicianId).toBe("tech-3");
    expect(missingPrimary.technicianIds).toContain("tech-3");
    expect(missingPrimary.issues).toContain(
      "primary_missing_from_canonical_set",
    );
  });
});
