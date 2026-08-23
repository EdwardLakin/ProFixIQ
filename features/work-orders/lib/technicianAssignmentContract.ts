export type TechnicianAssignmentIssue =
  | "primary_missing_from_canonical_set"
  | "canonical_set_without_primary"
  | "legacy_primary_conflict"
  | "legacy_set_conflict"
  | "legacy_only_assignment";

export type TechnicianAssignmentContract = {
  primaryTechnicianId: string | null;
  technicianIds: string[];
  supportingTechnicianIds: string[];
  source: "canonical" | "legacy_compatibility" | "unassigned";
  issues: TechnicianAssignmentIssue[];
};

export function resolveTechnicianAssignmentContract(input: {
  primaryTechnicianId?: string | null;
  legacyAssignedTo?: string | null;
  canonicalTechnicianIds?: readonly string[] | null;
}): TechnicianAssignmentContract {
  const primaryTechnicianId = input.primaryTechnicianId?.trim() || null;
  const legacyAssignedTo = input.legacyAssignedTo?.trim() || null;
  const canonicalTechnicianIds = [
    ...new Set(
      (input.canonicalTechnicianIds ?? [])
        .map((technicianId) => technicianId.trim())
        .filter(Boolean),
    ),
  ].sort();
  const issues: TechnicianAssignmentIssue[] = [];

  if (
    primaryTechnicianId &&
    !canonicalTechnicianIds.includes(primaryTechnicianId)
  ) {
    issues.push("primary_missing_from_canonical_set");
  }
  if (!primaryTechnicianId && canonicalTechnicianIds.length > 0) {
    issues.push("canonical_set_without_primary");
  }
  if (
    legacyAssignedTo &&
    primaryTechnicianId &&
    legacyAssignedTo !== primaryTechnicianId
  ) {
    issues.push("legacy_primary_conflict");
  }
  if (
    legacyAssignedTo &&
    canonicalTechnicianIds.length > 0 &&
    !canonicalTechnicianIds.includes(legacyAssignedTo)
  ) {
    issues.push("legacy_set_conflict");
  }

  if (!primaryTechnicianId && canonicalTechnicianIds.length === 0) {
    if (!legacyAssignedTo) {
      return {
        primaryTechnicianId: null,
        technicianIds: [],
        supportingTechnicianIds: [],
        source: "unassigned",
        issues,
      };
    }

    issues.push("legacy_only_assignment");
    return {
      primaryTechnicianId: legacyAssignedTo,
      technicianIds: [legacyAssignedTo],
      supportingTechnicianIds: [],
      source: "legacy_compatibility",
      issues,
    };
  }

  const technicianIds = [...canonicalTechnicianIds];
  if (primaryTechnicianId && !technicianIds.includes(primaryTechnicianId)) {
    technicianIds.unshift(primaryTechnicianId);
  }

  return {
    primaryTechnicianId,
    technicianIds,
    supportingTechnicianIds: technicianIds.filter(
      (technicianId) => technicianId !== primaryTechnicianId,
    ),
    source: "canonical",
    issues,
  };
}
