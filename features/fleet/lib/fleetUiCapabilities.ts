import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
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
  canConvertRequests: boolean;
  canCreateFleetWorkOrders: boolean;
  canViewBroadFleetOperations: boolean;
  canAccessPortalFleetWrappers: boolean;
  canViewServiceRequests: boolean;
};

export type FleetUiContext = {
  actorType: FleetActorContext["actorType"];
  actorLabel: string;
  experience: "internal_ops" | "external_manager" | "external_driver";
  isInternal: boolean;
  capabilities: FleetUiCapabilities;
};

function resolveActorLabel(actor: FleetActorContext): string {
  if (actor.actorType === "internal_staff") return "Internal Fleet Operations";
  if (actor.actorType === "fleet_manager") return "Fleet Manager";
  if (actor.actorType === "fleet_driver") return "Fleet Driver";
  return "Unknown Fleet Actor";
}

function resolveExperience(actor: FleetActorContext): FleetUiContext["experience"] {
  if (actor.actorType === "internal_staff") return "internal_ops";
  if (actor.actorType === "fleet_manager") return "external_manager";
  return "external_driver";
}

export function getFleetUiContext(actor: FleetActorContext): FleetUiContext {
  const canManageUnits = actor.isInternal || actor.actorType === "fleet_manager";
  const canViewDispatch = actor.capabilities.canRunFleetDispatchActions;
  const canConvertRequests =
    actor.capabilities.canConvertPretripToServiceRequest ||
    actor.capabilities.canConvertServiceRequestToWorkOrder;

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
      canConvertRequests,
      canCreateFleetWorkOrders: actor.capabilities.canAccessFleetIntake,
      canViewBroadFleetOperations: actor.capabilities.canSeeFleetWideUnits,
      canAccessPortalFleetWrappers: actor.capabilities.canAccessPortalFleetWrappers,
      canViewServiceRequests:
        actor.capabilities.canSeeFleetWideUnits || actor.isFleetActor,
    },
  };
}

export async function resolveFleetUiContext(
  supabase: SupabaseClient<DB>,
  options?: { requestedFleetId?: string | null; userId?: string },
): Promise<FleetUiContext> {
  const actor = await resolveFleetActorContext(supabase, options);
  return getFleetUiContext(actor);
}
