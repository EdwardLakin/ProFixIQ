export type CanonicalRole =
  | "owner"
  | "admin"
  | "manager"
  | "advisor"
  | "service"
  | "parts"
  | "mechanic"
  | "lead_hand"
  | "foreman"
  | "fleet_manager"
  | "dispatcher"
  | "driver"
  | "customer"
  | "unknown";

export const ROLE_GROUPS = {
  accountAdministrators: ["owner", "admin"],
  workforceManagers: ["owner", "admin", "manager"],
  financialViewers: ["owner", "admin", "manager"],
  billingOperators: ["owner", "admin", "manager", "advisor", "service"],
  shopWideOperators: [
    "owner",
    "admin",
    "manager",
    "advisor",
    "service",
    "parts",
    "lead_hand",
    "foreman",
  ],
  workOrderManagers: [
    "owner",
    "admin",
    "manager",
    "advisor",
    "service",
    "lead_hand",
    "foreman",
  ],
  workOrderCreators: [
    "owner",
    "admin",
    "manager",
    "advisor",
    "service",
    "lead_hand",
    "foreman",
  ],
  workAssigners: [
    "owner",
    "admin",
    "manager",
    "advisor",
    "lead_hand",
    "foreman",
  ],
  quoteAuthorizers: [
    "owner",
    "admin",
    "manager",
    "advisor",
    "service",
    "foreman",
  ],
  floorTechnicians: ["mechanic", "lead_hand", "foreman"],
} as const satisfies Record<string, readonly CanonicalRole[]>;

const ROLE_ALIASES: Record<string, CanonicalRole> = {
  owner: "owner",
  admin: "admin",
  manager: "manager",
  advisor: "advisor",
  service: "service",
  parts: "parts",
  mechanic: "mechanic",
  tech: "mechanic",
  technician: "mechanic",
  lead_hand: "lead_hand",
  leadhand: "lead_hand",
  "lead hand": "lead_hand",
  lead: "lead_hand",
  foreman: "foreman",
  fleet_manager: "fleet_manager",
  dispatcher: "dispatcher",
  driver: "driver",
  customer: "customer",
};

export type FleetRoleTier = "none" | "viewer" | "approver" | "manager";

export type ActorCapabilities = {
  canManageUsers: boolean;
  canManageWorkforce: boolean;
  canAuthorizeQuotes: boolean;
  canEditPricing: boolean;
  canManageWorkOrders: boolean;
  canPerformAssignedWork: boolean;
  canAssignWork: boolean;
  canManageParts: boolean;
  canRunInspections: boolean;
  canViewShopWideData: boolean;
  canViewFinancials: boolean;
  canManageScheduling: boolean;
  canApproveTimeAway: boolean;
  canReviewWorkforceTime: boolean;
  canFinalizeWorkforceTime: boolean;
  canManageFleetApprovals: boolean;
  canViewFleetOnlyData: boolean;
  canManageBranding: boolean;
  canManageBilling: boolean;
  canOverrideOperationalState: boolean;
  canInvitePortalCustomers: boolean;
  canManagePortalQr: boolean;
  canInviteFleetMembers: boolean;
};

type RoleCapabilityMap = Record<CanonicalRole, ActorCapabilities>;

const NONE: ActorCapabilities = {
  canManageUsers: false,
  canManageWorkforce: false,
  canAuthorizeQuotes: false,
  canEditPricing: false,
  canManageWorkOrders: false,
  canPerformAssignedWork: false,
  canAssignWork: false,
  canManageParts: false,
  canRunInspections: false,
  canViewShopWideData: false,
  canViewFinancials: false,
  canManageScheduling: false,
  canApproveTimeAway: false,
  canReviewWorkforceTime: false,
  canFinalizeWorkforceTime: false,
  canManageFleetApprovals: false,
  canViewFleetOnlyData: false,
  canManageBranding: false,
  canManageBilling: false,
  canOverrideOperationalState: false,
  canInvitePortalCustomers: false,
  canManagePortalQr: false,
  canInviteFleetMembers: false,
};

const CAPABILITY_MATRIX: RoleCapabilityMap = {
  owner: {
    ...NONE,
    canManageUsers: true,
    canManageWorkforce: true,
    canAuthorizeQuotes: true,
    canEditPricing: true,
    canManageWorkOrders: true,
    canPerformAssignedWork: true,
    canAssignWork: true,
    canManageParts: true,
    canRunInspections: true,
    canViewShopWideData: true,
    canViewFinancials: true,
    canManageScheduling: true,
    canApproveTimeAway: true,
    canReviewWorkforceTime: true,
    canFinalizeWorkforceTime: true,
    canManageBranding: true,
    canManageBilling: true,
    canOverrideOperationalState: true,
    canInvitePortalCustomers: true,
    canManagePortalQr: true,
    canInviteFleetMembers: true,
  },
  admin: {
    ...NONE,
    canManageUsers: true,
    canManageWorkforce: true,
    canAuthorizeQuotes: true,
    canEditPricing: true,
    canManageWorkOrders: true,
    canPerformAssignedWork: true,
    canAssignWork: true,
    canManageParts: true,
    canRunInspections: true,
    canViewShopWideData: true,
    canViewFinancials: true,
    canManageScheduling: true,
    canApproveTimeAway: true,
    canReviewWorkforceTime: true,
    canFinalizeWorkforceTime: true,
    canManageBranding: true,
    canManageBilling: true,
    canOverrideOperationalState: true,
    canInvitePortalCustomers: true,
    canManagePortalQr: true,
    canInviteFleetMembers: true,
  },
  manager: {
    ...NONE,
    canManageWorkforce: true,
    canAuthorizeQuotes: true,
    canEditPricing: true,
    canManageWorkOrders: true,
    canPerformAssignedWork: true,
    canAssignWork: true,
    canManageParts: true,
    canRunInspections: true,
    canViewShopWideData: true,
    canViewFinancials: true,
    canManageScheduling: true,
    canApproveTimeAway: true,
    canReviewWorkforceTime: true,
    canInvitePortalCustomers: true,
    canManagePortalQr: true,
    canInviteFleetMembers: true,
  },
  advisor: {
    ...NONE,
    canAuthorizeQuotes: true,
    canManageWorkOrders: true,
    canAssignWork: true,
    canRunInspections: true,
    canViewShopWideData: true,
    canManageScheduling: true,
    canInvitePortalCustomers: true,
  },
  service: {
    ...NONE,
    canAuthorizeQuotes: true,
    canManageWorkOrders: true,
    canRunInspections: true,
    canInvitePortalCustomers: true,
  },
  parts: {
    ...NONE,
    canManageParts: true,
    canViewShopWideData: true,
  },
  mechanic: {
    ...NONE,
    canPerformAssignedWork: true,
    canRunInspections: true,
  },
  lead_hand: {
    ...NONE,
    canManageWorkOrders: true,
    canPerformAssignedWork: true,
    canAssignWork: true,
    canManageParts: true,
    canRunInspections: true,
    canViewShopWideData: true,
    canManageScheduling: true,
    canInvitePortalCustomers: true,
  },
  foreman: {
    ...NONE,
    canAuthorizeQuotes: true,
    canManageWorkOrders: true,
    canPerformAssignedWork: true,
    canAssignWork: true,
    canManageParts: true,
    canRunInspections: true,
    canViewShopWideData: true,
    canManageScheduling: true,
    canInvitePortalCustomers: true,
  },
  fleet_manager: {
    ...NONE,
    canManageFleetApprovals: true,
    canViewFleetOnlyData: true,
  },
  dispatcher: {
    ...NONE,
    canManageFleetApprovals: true,
    canViewFleetOnlyData: true,
  },
  driver: {
    ...NONE,
    canViewFleetOnlyData: true,
  },
  customer: { ...NONE },
  unknown: { ...NONE },
};

const FLEET_ROLE_ALIASES: Record<string, FleetRoleTier> = {
  viewer: "viewer",
  driver: "viewer",
  member: "viewer",
  user: "viewer",
  approver: "approver",
  dispatcher: "approver",
  admin: "manager",
  manager: "manager",
  fleet_manager: "manager",
  owner: "manager",
};

export function canonicalizeRole(role: string | null | undefined): CanonicalRole {
  const key = String(role ?? "").trim().toLowerCase();
  return ROLE_ALIASES[key] ?? "unknown";
}

export function hasAnyRole(
  role: string | null | undefined,
  allowed: readonly CanonicalRole[],
): boolean {
  return allowed.includes(canonicalizeRole(role));
}

export function isAdminRole(role: string | null | undefined): boolean {
  return getActorCapabilities({ role }).canManageUsers;
}

export function canMutateWorkOrders(role: string | null | undefined): boolean {
  return getActorCapabilities({ role }).canManageWorkOrders;
}

export function canSendQuotes(role: string | null | undefined): boolean {
  return getActorCapabilities({ role }).canAuthorizeQuotes;
}

export function resolveFleetRoleTier(role: string | null | undefined): FleetRoleTier {
  const key = String(role ?? "").trim().toLowerCase();
  return FLEET_ROLE_ALIASES[key] ?? "none";
}

export function getActorCapabilities(input: {
  role: string | null | undefined;
  fleetRole?: string | null | undefined;
}): ActorCapabilities & {
  canonicalRole: CanonicalRole;
  fleetRoleTier: FleetRoleTier;
  isKnownRole: boolean;
} {
  const canonicalRole = canonicalizeRole(input.role);
  const fleetRoleTier = resolveFleetRoleTier(input.fleetRole);
  const roleCaps = CAPABILITY_MATRIX[canonicalRole];
  const isKnownRole = canonicalRole !== "unknown";

  const fleetCaps: Partial<ActorCapabilities> =
    fleetRoleTier === "manager"
      ? { canManageFleetApprovals: true, canViewFleetOnlyData: true }
      : fleetRoleTier === "approver"
        ? { canManageFleetApprovals: true, canViewFleetOnlyData: true }
        : fleetRoleTier === "viewer"
          ? { canViewFleetOnlyData: true }
          : {};

  return {
    ...roleCaps,
    ...fleetCaps,
    canonicalRole,
    fleetRoleTier,
    isKnownRole,
  };
}
