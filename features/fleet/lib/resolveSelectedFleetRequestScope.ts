import {
  resolveFleetActorScope,
  type FleetActorContext,
  type FleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";

type SelectedFleetRequestScopeInput = {
  explicitFleetId?: string | null;
  explicitShopId?: string | null;
  preferMembershipFleet?: boolean;
};

/**
 * Request-local adapter for routes that explicitly carry a server-validated
 * Fleet selection. The canonical actor/scope helpers retain their historical
 * profile-shop behavior for unselected callers.
 */
export function resolveSelectedFleetRequestScope(
  actor: FleetActorContext,
  input?: SelectedFleetRequestScopeInput,
): FleetActorScope | null {
  const explicitFleetId = input?.explicitFleetId ?? null;
  if (!explicitFleetId || actor.isInternal) {
    return resolveFleetActorScope(actor, input);
  }
  if (actor.actorType === "none") return null;

  const membership =
    actor.fleetMemberships.find(
      (item) => item.fleetId === explicitFleetId,
    ) ?? null;
  if (!membership) return null;

  const shopId = membership.shopId ?? actor.shopId;
  if (!shopId || (input?.explicitShopId && input.explicitShopId !== shopId)) {
    return null;
  }

  return { shopId, fleetId: explicitFleetId, fleetIds: [explicitFleetId] };
}
