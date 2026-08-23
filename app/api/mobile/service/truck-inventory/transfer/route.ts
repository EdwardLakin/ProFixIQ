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
  const sourceLocationId =
    payload.sourceLocationId ?? payload.source_location_id;
  const partId = payload.partId ?? payload.part_id;
  const quantity = positiveQuantity(payload.quantity ?? payload.qty);
  const key = operationKey(request, payload);

  if (
    !isUuid(serviceVehicleId) ||
    !isUuid(sourceLocationId) ||
    !isUuid(partId) ||
    quantity == null ||
    !key
  ) {
    return NextResponse.json(
      {
        error:
          "Truck, source location, part, quantity, and operation key are required.",
      },
      { status: 400 },
    );
  }

  const { data, error } = await fieldInventoryRpc(
    access.supabase,
    "field_transfer_stock_to_truck_authorized_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_service_vehicle_id: serviceVehicleId,
      p_source_location_id: sourceLocationId,
      p_part_id: partId,
      p_quantity: quantity,
      p_actor_user_id: access.authUserId,
      p_operation_key: key,
    },
  );
  if (error)
    return fieldInventoryErrorResponse(error, "field-truck-inventory/transfer");
  return NextResponse.json(data);
}
