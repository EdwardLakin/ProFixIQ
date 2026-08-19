import "server-only";

import { isCustomerMessagingRole } from "@/features/ai/lib/chat/authorization";
import {
  ESTIMATE_VIEW_ROLES,
  estimateActorForRole,
} from "@/features/estimates/lib/access";
import {
  getActorCapabilities,
  ROLE_GROUPS,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";
import type { VehicleWorkspacePermissions } from "@/features/vehicles/lib/vehicleWorkspace";

const LEGACY_ACCOUNT_PAGE_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
] as const satisfies readonly CanonicalRole[];

const PART_REQUEST_ROLES = [
  "owner",
  "admin",
  "manager",
  "parts",
] as const satisfies readonly CanonicalRole[];

const INSPECTION_OPEN_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "lead_hand",
  "foreman",
] as const satisfies readonly CanonicalRole[];

const WORK_ORDER_OPEN_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "mechanic",
  "lead_hand",
  "foreman",
] as const satisfies readonly CanonicalRole[];

export function vehicleWorkspacePermissionsForRole(
  role: CanonicalRole,
): VehicleWorkspacePermissions {
  const capabilities = getActorCapabilities({ role });
  const isWorkOrderCreator = (
    ROLE_GROUPS.workOrderCreators as readonly CanonicalRole[]
  ).includes(role);
  const isSchedulerBookingWriter = (
    ROLE_GROUPS.schedulerBookingWriters as readonly CanonicalRole[]
  ).includes(role);

  return {
    canViewAccountContact:
      capabilities.canManageWorkOrders || capabilities.canManageScheduling,
    canOpenAccount: (LEGACY_ACCOUNT_PAGE_ROLES as readonly CanonicalRole[]).includes(
      role,
    ),
    canViewFinancials: capabilities.canViewFinancials,
    canViewEstimates: (ESTIMATE_VIEW_ROLES as readonly CanonicalRole[]).includes(
      role,
    ),
    canOpenInspections: (
      INSPECTION_OPEN_ROLES as readonly CanonicalRole[]
    ).includes(role),
    canOpenWorkOrders: (
      WORK_ORDER_OPEN_ROLES as readonly CanonicalRole[]
    ).includes(role),
    canViewPartRequests: (PART_REQUEST_ROLES as readonly CanonicalRole[]).includes(
      role,
    ),
    canCreateWorkOrder: isWorkOrderCreator,
    canBookAppointment: isSchedulerBookingWriter,
    canOpenAppointments: capabilities.canManageScheduling,
    canCreateEstimate: estimateActorForRole(role).canCreate,
    canMessageCustomer: isCustomerMessagingRole(role),
    canViewRelatedVehicles:
      capabilities.canViewShopWideData || capabilities.canManageWorkOrders,
    isAssignedWorkOnly: role === "mechanic",
  };
}
