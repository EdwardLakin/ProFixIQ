import {
  WORKSPACE_CAPABILITY_CATALOG,
  WORKSPACE_CAPABILITY_GROUPS,
  type WorkspaceCapabilityDecisionSource,
  type WorkspaceCapabilityDescriptor,
  type WorkspaceCapabilityEffect,
  type WorkspaceCapabilityGroupId,
  type WorkspaceCapabilityKey,
} from "@/features/workspace/authorization/capabilities";

export type PermissionSnapshot = {
  shopId: string;
  actor: { profileId: string; canonicalRole: string; isOwner: boolean };
  manageableRoles: string[];
  capabilities: Array<{
    capabilityKey: WorkspaceCapabilityKey;
    isProtected: boolean;
    actorCanGrant: boolean;
  }>;
  presets: Array<{
    roleKey: string;
    capabilityKey: WorkspaceCapabilityKey;
    effect: "allow" | "deny";
  }>;
  rolePolicies: Array<{
    roleKey: string;
    capabilityKey: WorkspaceCapabilityKey;
    effect: "allow" | "deny";
  }>;
  employee: {
    profileId: string;
    fullName: string | null;
    canonicalRole: string;
    isSelf: boolean;
    manageable: boolean;
    overrides: Array<{
      capabilityKey: WorkspaceCapabilityKey;
      effect: "allow" | "deny";
    }>;
    effective: Array<{
      capabilityKey: WorkspaceCapabilityKey;
      granted: boolean;
      source: WorkspaceCapabilityDecisionSource;
    }>;
  } | null;
};

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  foreman: "Foreman",
  lead_hand: "Lead Hand",
  advisor: "Advisor",
  service: "Service Advisor",
  parts: "Parts",
  mechanic: "Technician",
};

export function roleLabel(roleKey: string): string {
  return ROLE_LABELS[roleKey] ?? roleKey.replace(/_/g, " ");
}

export type CapabilityGroupView = {
  id: WorkspaceCapabilityGroupId;
  label: string;
  description: string;
  descriptors: WorkspaceCapabilityDescriptor[];
};

/** Groups the catalog in the fixed presentation order shops see everywhere. */
export function capabilityGroups(
  descriptors: readonly WorkspaceCapabilityDescriptor[] = WORKSPACE_CAPABILITY_CATALOG,
): CapabilityGroupView[] {
  return WORKSPACE_CAPABILITY_GROUPS.map((group) => ({
    ...group,
    descriptors: descriptors.filter((entry) => entry.group === group.id),
  })).filter((group) => group.descriptors.length > 0);
}

export type RoleCapabilityRow = {
  descriptor: WorkspaceCapabilityDescriptor;
  /** What the shop has explicitly set. `inherit` means "use the ProFixIQ default". */
  value: WorkspaceCapabilityEffect;
  /** The ProFixIQ secure default for this role. */
  presetEffect: "allow" | "deny";
  /** What the role actually resolves to right now. */
  effectiveGranted: boolean;
  customized: boolean;
  isProtected: boolean;
  actorCanGrant: boolean;
};

export function roleCapabilityRows(
  snapshot: PermissionSnapshot,
  roleKey: string,
): RoleCapabilityRow[] {
  const presets = new Map(
    snapshot.presets
      .filter((entry) => entry.roleKey === roleKey)
      .map((entry) => [entry.capabilityKey, entry.effect]),
  );
  const policies = new Map(
    snapshot.rolePolicies
      .filter((entry) => entry.roleKey === roleKey)
      .map((entry) => [entry.capabilityKey, entry.effect]),
  );
  const meta = new Map(
    snapshot.capabilities.map((entry) => [entry.capabilityKey, entry]),
  );

  return WORKSPACE_CAPABILITY_CATALOG.map((descriptor) => {
    const presetEffect = presets.get(descriptor.capabilityKey) ?? "deny";
    const policyEffect = policies.get(descriptor.capabilityKey);
    const capability = meta.get(descriptor.capabilityKey);
    const effective = policyEffect ?? presetEffect;
    return {
      descriptor,
      value: policyEffect ?? "inherit",
      presetEffect,
      effectiveGranted: effective === "allow",
      customized: policyEffect !== undefined,
      // Protected capabilities intentionally ignore shop policy and individual
      // overrides, so they are shown but never editable.
      isProtected: capability?.isProtected ?? true,
      actorCanGrant: capability?.actorCanGrant ?? false,
    };
  });
}

export type EmployeeCapabilityRow = {
  descriptor: WorkspaceCapabilityDescriptor;
  /** The employee's own INHERIT / ALLOW / DENY setting. */
  value: WorkspaceCapabilityEffect;
  /** What the employee's role gives them before any individual override. */
  roleGranted: boolean;
  effectiveGranted: boolean;
  source: WorkspaceCapabilityDecisionSource;
  isProtected: boolean;
  actorCanGrant: boolean;
};

export function employeeCapabilityRows(
  snapshot: PermissionSnapshot,
): EmployeeCapabilityRow[] {
  const employee = snapshot.employee;
  if (!employee) return [];

  const overrides = new Map(
    employee.overrides.map((entry) => [entry.capabilityKey, entry.effect]),
  );
  const effective = new Map(
    employee.effective.map((entry) => [entry.capabilityKey, entry]),
  );
  const roleRows = new Map(
    roleCapabilityRows(snapshot, employee.canonicalRole).map((row) => [
      row.descriptor.capabilityKey,
      row,
    ]),
  );

  return WORKSPACE_CAPABILITY_CATALOG.map((descriptor) => {
    const roleRow = roleRows.get(descriptor.capabilityKey);
    const decision = effective.get(descriptor.capabilityKey);
    return {
      descriptor,
      value: overrides.get(descriptor.capabilityKey) ?? "inherit",
      roleGranted: roleRow?.effectiveGranted ?? false,
      effectiveGranted: decision?.granted ?? false,
      source: decision?.source ?? "unavailable",
      isProtected: roleRow?.isProtected ?? true,
      actorCanGrant: roleRow?.actorCanGrant ?? false,
    };
  });
}

export function overrideCount(snapshot: PermissionSnapshot): number {
  return snapshot.employee?.overrides.length ?? 0;
}

export function customizedRoleCount(
  snapshot: PermissionSnapshot,
  roleKey: string,
): number {
  return snapshot.rolePolicies.filter((entry) => entry.roleKey === roleKey)
    .length;
}

export function decisionSourceLabel(
  source: WorkspaceCapabilityDecisionSource,
  roleKey: string,
): string {
  if (source === "individual_override") return "Individual override";
  if (source === "shop_role_policy") return `${roleLabel(roleKey)} shop setting`;
  if (source === "profixiq_preset") return `${roleLabel(roleKey)} default`;
  return "Unavailable";
}
