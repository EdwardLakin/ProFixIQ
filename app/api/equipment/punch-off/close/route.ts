export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { CloseLineSchema } from "@/features/equipment/dispatch/lib/punchOff";
import {
  equipmentJson,
  readOperationKey,
  requireEquipmentDispatchAccess,
} from "@/features/equipment/dispatch/server/access";
import {
  EquipmentDispatchError,
  equipmentDispatchHttpStatus,
} from "@/features/equipment/dispatch/server/equipmentDispatchService";
import { closeLineAsOffice } from "@/features/equipment/dispatch/server/punchOffService";

/**
 * Office override: close a line whose technician forgot to punch off. Requires
 * dispatch authority and a written reason; running timers are ended and kept.
 */
export async function POST(request: Request) {
  const access = await requireEquipmentDispatchAccess({ requiredCapability: "canManageScheduling" });
  if (!access.ok) return access.response;

  const operationKey = readOperationKey(request);
  if (!operationKey) return equipmentJson({ error: "A stable Idempotency-Key is required." }, 400);

  const parsed = CloseLineSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return equipmentJson({ error: "Invalid close request.", issues: parsed.error.issues }, 400);
  }

  try {
    const result = await closeLineAsOffice({
      // Server-only command: the route has authenticated the actor and the
      // Equipment entitlement; the function re-checks dispatch authority.
      supabase: createAdminSupabase(),
      shopId: access.profile.shop_id,
      actorUserId: access.profile.id,
      operationKey,
      request: parsed.data,
    });
    return equipmentJson(result);
  } catch (error) {
    if (error instanceof EquipmentDispatchError) {
      return equipmentJson({ error: error.message }, equipmentDispatchHttpStatus(error));
    }
    console.error("[equipment/punch-off/close] failed", error);
    return equipmentJson({ error: "Close line failed." }, 500);
  }
}
