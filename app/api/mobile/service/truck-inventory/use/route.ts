import { NextResponse } from "next/server";

import { requireMobileServiceOperatorApiAccess } from "@/features/mobile/service/server/access";
import {
  fieldInventoryErrorResponse,
  fieldInventoryRpc,
  isUuid,
  operationKey,
  positiveQuantity,
} from "../_lib";

export async function POST(request: Request) {
  const access = await requireMobileServiceOperatorApiAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const payload = body ?? {};
  const visitId = payload.visitId ?? payload.service_visit_id;
  const lineId = payload.workOrderLineId ?? payload.work_order_line_id;
  const partId = payload.partId ?? payload.part_id;
  const quantity = positiveQuantity(payload.quantity ?? payload.qty);
  const key = operationKey(request, payload);

  if (
    !isUuid(visitId) ||
    !isUuid(lineId) ||
    !isUuid(partId) ||
    quantity == null ||
    !key
  ) {
    return NextResponse.json(
      { error: "Visit, repair line, part, quantity, and operation key are required." },
      { status: 400 },
    );
  }

  const { data, error } = await fieldInventoryRpc(
    access.supabase,
    "field_use_truck_part_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_service_visit_id: visitId,
      p_work_order_line_id: lineId,
      p_part_id: partId,
      p_quantity: quantity,
      p_actor_user_id: access.authUserId,
      p_operation_key: key,
    },
  );
  if (error) return fieldInventoryErrorResponse(error, "field-truck-inventory/use");
  return NextResponse.json(data);
}
