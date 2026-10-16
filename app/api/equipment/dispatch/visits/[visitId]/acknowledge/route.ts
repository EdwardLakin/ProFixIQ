export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  equipmentJson,
  requireEquipmentDispatchAccess,
} from "@/features/equipment/dispatch/server/access";
import {
  acknowledgeVisit,
  EquipmentDispatchError,
  equipmentDispatchHttpStatus,
} from "@/features/equipment/dispatch/server/equipmentDispatchService";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An assigned technician acknowledges a dispatch. Recorded separately from push
 * delivery; never changes the visit status and never starts labor. Naturally
 * idempotent, so no key is required.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ visitId: string }> },
) {
  const access = await requireEquipmentDispatchAccess();
  if (!access.ok) return access.response;

  const { visitId } = await context.params;
  if (!UUID.test(visitId)) return equipmentJson({ error: "Invalid visit." }, 400);

  try {
    const result = await acknowledgeVisit({
      // Server-only command: the route has authenticated the actor and the
      // Equipment entitlement above.
      supabase: createAdminSupabase(),
      shopId: access.profile.shop_id,
      actorUserId: access.profile.id,
      actorProfileId: access.profile.id,
      visitId,
    });
    return equipmentJson(result);
  } catch (error) {
    if (error instanceof EquipmentDispatchError) {
      return equipmentJson({ error: error.message }, equipmentDispatchHttpStatus(error));
    }
    console.error("[equipment/dispatch/acknowledge] failed", error);
    return equipmentJson({ error: "Acknowledgement failed." }, 500);
  }
}
