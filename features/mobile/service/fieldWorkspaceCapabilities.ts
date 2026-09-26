export type FieldWorkspaceCapabilities = {
  canManageScheduling: boolean;
  canManageParts: boolean;
  canManageOperations: boolean;
  canManageInspectionTemplates: boolean;
  canConfigureFieldService: boolean;
  canInviteFleetMembers: boolean;
  canSwitchWorkspace: boolean;
  /**
   * True when this same account also has Shop entitlement (not just Fleet),
   * so a direct one-tap link back to Shop Mobile is meaningful. Distinct
   * from canSwitchWorkspace, which also covers Fleet-only accounts and
   * always routes through the /sign-in product chooser rather than
   * straight to /mobile.
   */
  canReturnToShop: boolean;
};

export const EMPTY_FIELD_WORKSPACE_CAPABILITIES: FieldWorkspaceCapabilities = {
  canManageScheduling: false,
  canManageParts: false,
  canManageOperations: false,
  canManageInspectionTemplates: false,
  canConfigureFieldService: false,
  canInviteFleetMembers: false,
  canSwitchWorkspace: false,
  canReturnToShop: false,
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
    canInviteFleetMembers: capabilities?.canInviteFleetMembers === true,
    canSwitchWorkspace: capabilities?.canSwitchWorkspace === true,
    canReturnToShop: capabilities?.canReturnToShop === true,
  };
}

export function canUseFieldWorkspaceCapability(
  capabilities: FieldWorkspaceCapabilities,
  requiredCapability?: keyof FieldWorkspaceCapabilities,
): boolean {
  return requiredCapability ? capabilities[requiredCapability] : true;
}
