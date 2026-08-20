export const WORKSPACE_CAPABILITIES = {
  manageTeamPermissions: "team.permissions.manage",
  manageWorkOrderAssignments: "work_order.assignment.manage",
} as const;

export type WorkspaceCapabilityKey =
  (typeof WORKSPACE_CAPABILITIES)[keyof typeof WORKSPACE_CAPABILITIES];

export const WORKSPACE_CAPABILITY_KEYS = Object.values(
  WORKSPACE_CAPABILITIES,
) as WorkspaceCapabilityKey[];

export type WorkspaceCapabilityDecisionSource =
  | "individual_override"
  | "shop_role_policy"
  | "profixiq_preset"
  | "unavailable";

export type WorkspaceCapabilityDecision = {
  capabilityKey: WorkspaceCapabilityKey;
  accessLevel: "view" | "manage";
  granted: boolean;
  source: WorkspaceCapabilityDecisionSource;
};

export type EffectiveWorkspaceCapabilities = Record<
  WorkspaceCapabilityKey,
  WorkspaceCapabilityDecision
>;

export function createDeniedWorkspaceCapabilities(): EffectiveWorkspaceCapabilities {
  return {
    [WORKSPACE_CAPABILITIES.manageTeamPermissions]: {
      capabilityKey: WORKSPACE_CAPABILITIES.manageTeamPermissions,
      accessLevel: "manage",
      granted: false,
      source: "unavailable",
    },
    [WORKSPACE_CAPABILITIES.manageWorkOrderAssignments]: {
      capabilityKey: WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
      accessLevel: "manage",
      granted: false,
      source: "unavailable",
    },
  };
}
