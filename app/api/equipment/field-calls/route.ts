export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { FieldCallSchema } from "@/features/equipment/dispatch/lib/equipmentDispatch";
import {
  equipmentJson,
  readOperationKey,
  requireEquipmentDispatchAccess,
} from "@/features/equipment/dispatch/server/access";
import {
  createFieldCall,
  EquipmentDispatchError,
  equipmentDispatchHttpStatus,
} from "@/features/equipment/dispatch/server/equipmentDispatchService";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";

/**
 * Office "New field call": creates the linked work order and visit in one
 * transaction. Only office roles that may create work orders can call this;
 * technicians cannot originate customer calls.
 */
export async function POST(request: Request) {
  const access = await requireEquipmentDispatchAccess({
    requiredCapability: "canManageScheduling",
    allowRoles: ROLE_GROUPS.workOrderCreators,
  });
  if (!access.ok) return access.response;

  const operationKey = readOperationKey(request);
  if (!operationKey) return equipmentJson({ error: "A stable Idempotency-Key is required." }, 400);

  const parsed = FieldCallSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return equipmentJson({ error: "Invalid field call.", issues: parsed.error.issues }, 400);
  }

  try {
    const result = await createFieldCall({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      actorUserId: access.profile.id,
      actorProfileId: access.profile.id,
      operationKey,
      request: parsed.data,
    });
    return equipmentJson(result, result.idempotent ? 200 : 201);
  } catch (error) {
    if (error instanceof EquipmentDispatchError) {
      return equipmentJson({ error: error.message }, equipmentDispatchHttpStatus(error));
    }
    console.error("[equipment/field-calls] failed", error);
    return equipmentJson({ error: "Field call failed." }, 500);
  }
}
