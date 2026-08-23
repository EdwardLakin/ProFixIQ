import { NextResponse } from "next/server";

import { requireMobileServiceOperatorApiAccess } from "@/features/mobile/service/server/access";
import {
  fieldInventoryErrorResponse,
  fieldInventoryRpc,
  operationKey,
  optionalUuid,
} from "../_lib";

type Body = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export async function POST(request: Request) {
  const access = await requireMobileServiceOperatorApiAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as Body | null;
  const payload = body ?? {};
  const key = operationKey(request, payload);
  const code = text(payload.code);
  const externalId = text(payload.externalId ?? payload.external_id);
  const partNumber = text(payload.partNumber ?? payload.part_number);
  const supplierSku = text(payload.supplierSku ?? payload.supplier_sku);
  const connectionId = optionalUuid(
    payload.connectionId ?? payload.connection_id,
  );
  const supplierId = optionalUuid(payload.supplierId ?? payload.supplier_id);
  const packageQuantityRaw =
    payload.packageQuantity ?? payload.package_quantity;
  const packageQuantity =
    packageQuantityRaw == null || packageQuantityRaw === ""
      ? 1
      : Number(packageQuantityRaw);
  const unitCost = optionalNumber(payload.unitCost ?? payload.unit_cost);
  const unitSellPrice = optionalNumber(
    payload.unitSellPrice ?? payload.unit_sell_price,
  );

  if ((!code && !externalId && !partNumber && !supplierSku) || !key) {
    return NextResponse.json(
      { error: "A part identity and stable operation key are required." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(packageQuantity) || packageQuantity <= 0) {
    return NextResponse.json(
      { error: "Package quantity must be greater than zero." },
      { status: 400 },
    );
  }
  if ((payload.connectionId || payload.connection_id) && !connectionId) {
    return NextResponse.json({ error: "Invalid connection." }, { status: 400 });
  }
  if ((payload.supplierId || payload.supplier_id) && !supplierId) {
    return NextResponse.json({ error: "Invalid supplier." }, { status: 400 });
  }

  const { data, error } = await fieldInventoryRpc(
    access.supabase,
    "field_resolve_or_create_part_identity_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_actor_user_id: access.authUserId,
      p_code: code,
      p_provider: text(payload.provider) ?? "manual",
      p_external_id: externalId,
      p_connection_id: connectionId,
      p_supplier_id: supplierId,
      p_name: text(payload.name),
      p_manufacturer: text(payload.manufacturer),
      p_part_number: partNumber,
      p_supplier_sku: supplierSku,
      p_unit_of_measure: text(payload.unitOfMeasure ?? payload.unit_of_measure),
      p_package_quantity: packageQuantity,
      p_create_if_missing:
        payload.createIfMissing === true || payload.create_if_missing === true,
      p_unit_cost: unitCost,
      p_unit_sell_price: unitSellPrice,
      p_metadata:
        payload.metadata && typeof payload.metadata === "object"
          ? payload.metadata
          : {},
      p_operation_key: key,
    },
  );
  if (error)
    return fieldInventoryErrorResponse(error, "field-truck-inventory/resolve");
  return NextResponse.json(data);
}
