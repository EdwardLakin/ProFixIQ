import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { resolveFleetRoleTier } from "@/features/shared/lib/rbac";
import {
  resolveFleetActorContext,
  type FleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";

type DB = Database;

export type FleetUiCapabilities = {
  canViewDispatch: boolean;
  canManageUnits: boolean;
  canSubmitPretrip: boolean;
  canReviewPretripHistory: boolean;
  canCreateServiceRequests: boolean;
  canViewBroadFleetOperations: boolean;
  canAccessPortalFleetWrappers: boolean;
  canViewServiceRequests: boolean;
  canManagePretripTemplates: boolean;
  canViewUnitMaintenanceRecord: boolean;
};

export type FleetUiContext = {
  actorType: FleetActorContext["actorType"];
  actorLabel: string;
  experience:
    | "internal_ops"
    | "external_manager"
    | "external_dispatcher"
    | "external_driver";
  isInternal: boolean;
  capabilities: FleetUiCapabilities;
};

export type FleetShellContext = Pick<
  FleetUiContext,
  "actorLabel" | "experience"
> & {
  canAccessManagerWorkspaces: boolean;
};

function resolveActorLabel(actor: FleetActorContext): string {
  if (actor.actorType === "internal_staff") return "Internal Fleet Operations";
  if (actor.actorType === "fleet_manager") return "Fleet Manager";
  if (actor.actorType === "fleet_dispatcher") return "Fleet Dispatcher";
  if (actor.actorType === "fleet_driver") return "Fleet Driver";
  return "Unknown Fleet Actor";
}

function resolveExperience(
  actor: FleetActorContext,
): FleetUiContext["experience"] {
  if (actor.actorType === "internal_staff") return "internal_ops";
  if (actor.actorType === "fleet_manager") return "external_manager";
  if (actor.actorType === "fleet_dispatcher") return "external_dispatcher";
  return "external_driver";
}

export function getFleetUiContext(actor: FleetActorContext): FleetUiContext {
  const canManageInternalFleet = ["owner", "admin", "manager"].includes(
    actor.canonicalRole,
  );
  const canManageUnits = actor.isInternal
    ? canManageInternalFleet
    : actor.actorType === "fleet_manager";
  const canViewDispatch = actor.capabilities.canRunFleetDispatchActions;
  const canCreateServiceRequests = actor.isInternal
    ? canManageInternalFleet
    : actor.actorType === "fleet_manager";

  return {
    actorType: actor.actorType,
    actorLabel: resolveActorLabel(actor),
    experience: resolveExperience(actor),
    isInternal: actor.isInternal,
    capabilities: {
      canViewDispatch,
      canManageUnits,
      canSubmitPretrip: actor.capabilities.canCreatePretripReports,
      canReviewPretripHistory: actor.actorType !== "none",
      canCreateServiceRequests,
      canViewBroadFleetOperations: actor.capabilities.canSeeFleetWideUnits,
      canAccessPortalFleetWrappers:
        actor.capabilities.canAccessPortalFleetWrappers,
      canViewServiceRequests: actor.capabilities.canSeeFleetWideUnits,
      canManagePretripTemplates: canManageUnits,
      canViewUnitMaintenanceRecord:
        actor.actorType === "internal_staff" ||
        actor.actorType === "fleet_manager",
    },
  };
}

export function getFleetShellContext(
  actor: FleetActorContext,
  fleetId?: string | null,
): FleetShellContext {
  const base = getFleetUiContext(actor);
  const membership =
    !actor.isInternal && fleetId
      ? actor.fleetMemberships.find((item) => item.fleetId === fleetId)
      : null;

  if (!membership) {
    return {
      actorLabel: base.actorLabel,
      experience: base.experience,
      canAccessManagerWorkspaces: base.capabilities.canManageUnits,
    };
  }

  const tier = resolveFleetRoleTier(membership.role);
  if (tier === "manager") {
    return {
      actorLabel: "Fleet Manager",
      experience: "external_manager",
      canAccessManagerWorkspaces: true,
    };
  }
  if (tier === "approver") {
    return {
      actorLabel: "Fleet Dispatcher",
      experience: "external_dispatcher",
      canAccessManagerWorkspaces: false,
    };
  }
  return {
    actorLabel: "Fleet Driver",
    experience: "external_driver",
    canAccessManagerWorkspaces: false,
  };
}

export async function resolveFleetUiContext(
  supabase: SupabaseClient<DB>,
  options?: { requestedFleetId?: string | null; userId?: string },
): Promise<FleetUiContext> {
  const actor = await resolveFleetActorContext(supabase, options);
  return getFleetUiContext(actor);
}
