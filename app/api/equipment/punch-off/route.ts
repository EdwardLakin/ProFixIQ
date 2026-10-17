export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { PunchOffSchema } from "@/features/equipment/dispatch/lib/punchOff";
import {
  equipmentJson,
  readOperationKey,
  requireEquipmentDispatchAccess,
} from "@/features/equipment/dispatch/server/access";
import {
  EquipmentDispatchError,
  equipmentDispatchHttpStatus,
} from "@/features/equipment/dispatch/server/equipmentDispatchService";
import { punchOffLine } from "@/features/equipment/dispatch/server/punchOffService";

/**
 * A technician punches themselves off a line. The last technician to punch off
 * closes the line; everyone else only ends their own labor.
 */
export async function POST(request: Request) {
  const access = await requireEquipmentDispatchAccess();
  if (!access.ok) return access.response;

  const operationKey = readOperationKey(request);
  if (!operationKey) return equipmentJson({ error: "A stable Idempotency-Key is required." }, 400);

  const parsed = PunchOffSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return equipmentJson({ error: "Invalid punch-off.", issues: parsed.error.issues }, 400);
  }

  try {
    const result = await punchOffLine({
      // Server-only command: the route has authenticated the technician and
      // the Equipment entitlement above; the function re-checks identity.
      supabase: createAdminSupabase(),
      shopId: access.profile.shop_id,
      technicianId: access.profile.id,
      actorUserId: access.profile.id,
      operationKey,
      request: parsed.data,
    });
    return equipmentJson(result);
  } catch (error) {
    if (error instanceof EquipmentDispatchError) {
      return equipmentJson({ error: error.message }, equipmentDispatchHttpStatus(error));
    }
    console.error("[equipment/punch-off] failed", error);
    return equipmentJson({ error: "Punch-off failed." }, 500);
  }
}
