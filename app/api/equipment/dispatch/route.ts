export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { DispatchWorkOrderSchema } from "@/features/equipment/dispatch/lib/equipmentDispatch";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  equipmentJson,
  readOperationKey,
  requireEquipmentDispatchAccess,
} from "@/features/equipment/dispatch/server/access";
import {
  dispatchExistingWorkOrder,
  EquipmentDispatchError,
  equipmentDispatchHttpStatus,
} from "@/features/equipment/dispatch/server/equipmentDispatchService";

/** Dispatch (or schedule) a visit on an existing Equipment work order. */
export async function POST(request: Request) {
  const access = await requireEquipmentDispatchAccess({ requiredCapability: "canManageScheduling" });
  if (!access.ok) return access.response;

  const operationKey = readOperationKey(request);
  if (!operationKey) return equipmentJson({ error: "A stable Idempotency-Key is required." }, 400);

  const parsed = DispatchWorkOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return equipmentJson({ error: "Invalid dispatch.", issues: parsed.error.issues }, 400);
  }

  try {
    const result = await dispatchExistingWorkOrder({
      // Server-only command: the route has authenticated the actor and the
      // Equipment entitlement above.
      supabase: createAdminSupabase(),
      shopId: access.profile.shop_id,
      actorUserId: access.profile.id,
      actorProfileId: access.profile.id,
      operationKey,
      request: parsed.data,
    });
    return equipmentJson(result, result.idempotent ? 200 : 201);
  } catch (error) {
    if (error instanceof EquipmentDispatchError) {
      return equipmentJson(
        { error: error.message, ...(error.detail ? { detail: error.detail } : {}) },
        equipmentDispatchHttpStatus(error),
      );
    }
    console.error("[equipment/dispatch] failed", error);
    return equipmentJson({ error: "Dispatch failed." }, 500);
  }
}
