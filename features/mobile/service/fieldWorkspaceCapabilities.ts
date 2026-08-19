export type FieldWorkspaceCapabilities = {
  canManageScheduling: boolean;
  canManageParts: boolean;
  canManageOperations: boolean;
  canManageInspectionTemplates: boolean;
  canConfigureFieldService: boolean;
  canSwitchWorkspace: boolean;
};

export const EMPTY_FIELD_WORKSPACE_CAPABILITIES: FieldWorkspaceCapabilities = {
  canManageScheduling: false,
  canManageParts: false,
  canManageOperations: false,
  canManageInspectionTemplates: false,
  canConfigureFieldService: false,
  canSwitchWorkspace: false,
};

export function normalizeFieldWorkspaceCapabilities(
  value: unknown,
): FieldWorkspaceCapabilities {
  const capabilities =
    value && typeof value === "object"
      ? (value as Partial<FieldWorkspaceCapabilities>)
      : null;

  return {
    canManageScheduling: capabilities?.canManageScheduling === true,
    canManageParts: capabilities?.canManageParts === true,
    canManageOperations: capabilities?.canManageOperations === true,
    canManageInspectionTemplates:
      capabilities?.canManageInspectionTemplates === true,
    canConfigureFieldService: capabilities?.canConfigureFieldService === true,
    canSwitchWorkspace: capabilities?.canSwitchWorkspace === true,
  };
}

export function canUseFieldWorkspaceCapability(
  capabilities: FieldWorkspaceCapabilities,
  requiredCapability?: keyof FieldWorkspaceCapabilities,
): boolean {
  return requiredCapability ? capabilities[requiredCapability] : true;
}
