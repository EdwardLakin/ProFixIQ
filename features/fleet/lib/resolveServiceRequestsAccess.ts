import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  resolveFleetActorContext,
  type FleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";
import { resolveSelectedFleetRequestScope } from "@/features/fleet/lib/resolveSelectedFleetRequestScope";

export type ServiceRequestsAccessDecision =
  | {
      ok: true;
      scope: FleetActorScope;
      isCanonicalFleetManager: boolean;
      dispatcherView: boolean;
      hasFieldAccess: boolean;
    }
  | { ok: false; status: number; error: string };

/**
 * Who may see/act on a shop's fleet service-request inbox, shared by the
 * data-fetching route and the lightweight nav-visibility check so the two
 * can never drift: fleet managers/dispatchers (fleet-side roles), or a
 * verified Field Service operator for this exact shop — "Field is a full
 * operations workspace with no separate advisor/manager to hand this off
 * to" (see the POST route this was extracted from).
 */
export async function resolveServiceRequestsAccess(
  supabase: SupabaseClient<Database>,
  input: { requestedFleetId?: string | null } = {},
): Promise<ServiceRequestsAccessDecision> {
  const requestedFleetId = input.requestedFleetId ?? null;
  const actor = await resolveFleetActorContext(supabase, { requestedFleetId });
  const scope = resolveSelectedFleetRequestScope(actor, {
    explicitFleetId: requestedFleetId,
    preferMembershipFleet: !actor.isInternal,
  });
  const dispatcherView = actor.actorType === "fleet_dispatcher";
  const isCanonicalFleetManager =
    actor.isInternal || actor.actorType === "fleet_manager";

  if (!actor.userId) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (!scope?.shopId) {
    return { ok: false, status: 403, error: "Fleet access required" };
  }

  let hasFieldAccess = false;
  if (
    !isCanonicalFleetManager &&
    !dispatcherView &&
    actor.profileShopId === scope.shopId
  ) {
    const admin = createAdminSupabase();
    const { data } = await admin.rpc("mobile_profile_has_field_service_access", {
      p_shop_id: scope.shopId,
      p_profile_id: actor.userId,
    });
    hasFieldAccess = data === true;
  }

  if (!isCanonicalFleetManager && !dispatcherView && !hasFieldAccess) {
    return {
      ok: false,
      status: 403,
      error: "Fleet manager or dispatcher access required",
    };
  }

  return { ok: true, scope, isCanonicalFleetManager, dispatcherView, hasFieldAccess };
}
