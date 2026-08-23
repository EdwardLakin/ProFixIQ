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
  const access = await requireMobileServiceOperatorApiAccess({
    requiredCapability: "canManageParts",
  });
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const payload = body ?? {};
  const serviceVehicleId =
    payload.serviceVehicleId ?? payload.service_vehicle_id;
  const purchaseOrderId = payload.purchaseOrderId ?? payload.purchase_order_id;
  const purchaseOrderLineId =
    payload.purchaseOrderLineId ?? payload.purchase_order_line_id;
  const quantity = positiveQuantity(payload.quantity ?? payload.qty);
  const key = operationKey(request, payload);

  if (
    !isUuid(serviceVehicleId) ||
    !isUuid(purchaseOrderId) ||
    !isUuid(purchaseOrderLineId) ||
    quantity == null ||
    !key
  ) {
    return NextResponse.json(
      {
        error:
          "Truck, purchase-order line, quantity, and operation key are required.",
      },
      { status: 400 },
    );
  }

  const { data, error } = await fieldInventoryRpc(
    access.supabase,
    "field_receive_po_part_to_truck_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_service_vehicle_id: serviceVehicleId,
      p_purchase_order_id: purchaseOrderId,
      p_purchase_order_line_id: purchaseOrderLineId,
      p_quantity: quantity,
      p_actor_user_id: access.authUserId,
      p_operation_key: key,
    },
  );
  if (error)
    return fieldInventoryErrorResponse(error, "field-truck-inventory/receive");
  return NextResponse.json(data);
}
