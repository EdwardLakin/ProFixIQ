import type { CanonicalRole } from "@/features/shared/lib/rbac";
import type { EstimateActor } from "@/features/estimates/types";

export const ESTIMATE_ADVISOR_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "foreman",
] as const satisfies readonly CanonicalRole[];

export const ESTIMATE_PARTS_ROLES = [
  "owner",
  "admin",
  "manager",
  "parts",
  "lead_hand",
  "foreman",
] as const satisfies readonly CanonicalRole[];

export const ESTIMATE_VIEW_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "foreman",
  "parts",
  "lead_hand",
] as const satisfies readonly CanonicalRole[];

export function estimateActorForRole(role: CanonicalRole): EstimateActor {
  const advisorRoles = new Set<CanonicalRole>(ESTIMATE_ADVISOR_ROLES);
  const partsRoles = new Set<CanonicalRole>(ESTIMATE_PARTS_ROLES);
  const canUseAdvisorFlow = advisorRoles.has(role);
  const canUsePartsFlow = partsRoles.has(role);

  return {
    role,
    mode: canUsePartsFlow && !canUseAdvisorFlow ? "parts" : "advisor",
    canCreate: canUseAdvisorFlow,
    canEdit: canUseAdvisorFlow,
    canSend: canUseAdvisorFlow,
    canCompleteParts: canUsePartsFlow,
  };
}
