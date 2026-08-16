export type FieldWorkspaceCapabilities = {
  canManageScheduling: boolean;
  canManageParts: boolean;
  canAccessFleet: boolean;
  canConfigureFieldService: boolean;
};

export const EMPTY_FIELD_WORKSPACE_CAPABILITIES: FieldWorkspaceCapabilities = {
  canManageScheduling: false,
  canManageParts: false,
  canAccessFleet: false,
  canConfigureFieldService: false,
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
    canAccessFleet: capabilities?.canAccessFleet === true,
    canConfigureFieldService: capabilities?.canConfigureFieldService === true,
  };
}

export function canUseFieldWorkspaceCapability(
  capabilities: FieldWorkspaceCapabilities,
  requiredCapability?: keyof FieldWorkspaceCapabilities,
): boolean {
  return requiredCapability ? capabilities[requiredCapability] : true;
}
