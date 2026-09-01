import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import {
  resolveFleetActorContext,
  type FleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";
import {
  getActorCapabilities,
  resolveFleetRoleTier,
} from "@/features/shared/lib/rbac";
import {
  getFleetShellContext,
  getFleetUiContext,
  type FleetShellContext,
  type FleetUiContext,
} from "@/features/fleet/lib/fleetUiCapabilities";

/**
 * React cache is request-scoped here. It deduplicates the layout + page actor
 * lookup without carrying role or entitlement state across requests.
 */
const getFleetPortalBaseActorContext = cache(
  async (): Promise<FleetActorContext & { userId: string }> => {
    const supabase = createServerSupabaseRSC();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/portal/auth/sign-in?redirect=%2Fportal%2Ffleet");
    }

    const actor = await resolveFleetActorContext(supabase, { userId: user.id });
    if (!actor.capabilities.canAccessPortalFleetWrappers) {
      redirect("/portal");
    }

    return { ...actor, userId: user.id };
  },
);

const isInternalFleetInActorShop = cache(
  async (shopId: string, fleetId: string): Promise<boolean> => {
    const supabase = createServerSupabaseRSC();
    const { data, error } = await supabase
      .from("fleets")
      .select("id")
      .eq("id", fleetId)
      .eq("shop_id", shopId)
      .maybeSingle();
    return !error && Boolean(data);
  },
);

function selectRequestedFleetActor(
  actor: FleetActorContext & { userId: string },
  requestedFleetId: string | null,
): FleetActorContext & { userId: string } {
  if (!requestedFleetId || requestedFleetId === actor.primaryFleetId) {
    return actor;
  }
  const membership = actor.fleetMemberships.find(
    (item) => item.fleetId === requestedFleetId,
  );
  if (!membership) return actor;
  if (actor.isInternal) {
    return {
      ...actor,
      primaryFleetId: membership.fleetId,
      membershipRole: membership.role,
    };
  }

  const tier = resolveFleetRoleTier(membership.role);
  const normalizedRole = String(membership.role ?? "").trim().toLowerCase();
  const actorType =
    tier === "manager"
      ? "fleet_manager"
      : ["dispatcher", "approver"].includes(normalizedRole)
        ? "fleet_dispatcher"
        : tier === "viewer"
          ? "fleet_driver"
          : "none";
  const actorCaps = getActorCapabilities({
    role: actor.profileRole,
    fleetRole: membership.role,
  });
  const isManager = actorType === "fleet_manager";
  const isDispatcher = actorType === "fleet_dispatcher";
  const isDriver = actorType === "fleet_driver";

  return {
    ...actor,
    actorType,
    primaryFleetId: membership.fleetId,
    membershipRole: membership.role,
    isFleetActor: isManager || isDispatcher || isDriver,
    capabilities: {
      canSeeFleetWideUnits: isManager || isDispatcher,
      canCreatePretripReports: isDriver,
      canConvertPretripToServiceRequest: isManager || isDispatcher,
      canAccessFleetIntake: isManager || isDispatcher || isDriver,
      canAccessPortalFleetWrappers: isManager || isDispatcher || isDriver,
      canRunFleetDispatchActions: actorCaps.canManageFleetApprovals,
      canOverrideShopScope: false,
    },
  };
}

export async function getFleetPortalActorContext(
  requestedFleetId: string | null = null,
): Promise<FleetActorContext & { userId: string }> {
  const actor = await getFleetPortalBaseActorContext();
  if (
    requestedFleetId &&
    actor.isInternal &&
    actor.shopId &&
    requestedFleetId !== actor.primaryFleetId &&
    !actor.fleetMemberships.some(
      (membership) => membership.fleetId === requestedFleetId,
    ) &&
    (await isInternalFleetInActorShop(actor.shopId, requestedFleetId))
  ) {
    return { ...actor, primaryFleetId: requestedFleetId };
  }
  return selectRequestedFleetActor(actor, requestedFleetId);
}

export async function requireFleetPortalActor(
  requestedFleetId: string | null = null,
): Promise<
  FleetUiContext & {
    userId: string;
    primaryFleetId: string | null;
    fleetShellContexts: Record<string, FleetShellContext>;
  }
> {
  const actor = await getFleetPortalActorContext(requestedFleetId);

  return {
    ...getFleetUiContext(actor),
    userId: actor.userId,
    primaryFleetId: actor.primaryFleetId,
    fleetShellContexts: Object.fromEntries(
      actor.fleetMemberships.map((membership) => [
        membership.fleetId,
        getFleetShellContext(actor, membership.fleetId),
      ]),
    ),
  };
}
