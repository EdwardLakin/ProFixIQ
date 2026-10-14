export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  isAssetId,
  validateEquipmentAssetProfileMutation,
} from "@/features/equipment/lib/assetProfile";
import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";

const NO_STORE = { "Cache-Control": "private, no-store" };
const DUPLICATE_UNIT_MESSAGE = "That unit # already exists. Use ‘Add existing asset’ instead.";
const DUPLICATE_VIN_MESSAGE = "That VIN already belongs to an existing Shop asset. Use ‘Add existing asset’ instead.";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function optionalText(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error("invalid_text");
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error("invalid_text");
  return trimmed || null;
}

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess({ allowRoles: ROLE_GROUPS.billingOperators });
  if (!access.ok) return access.response;

  const entitlement = await resolveEquipmentAddonEntitlementForShop(access.profile.shop_id).catch((error) => {
    console.error("[equipment/assets] entitlement failed", { shopId: access.profile.shop_id, error });
    return null;
  });
  if (!entitlement) return json({ error: "Equipment entitlement could not be verified. Try again." }, 503);
  if (!entitlement.enabled) return json({ error: "An active Equipment subscription is required." }, 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Equipment details are required." }, 400);
  }

  if (!isAssetId(body.operationId)) {
    return json({ error: "Equipment creation request is invalid. Reopen the dialog and try again." }, 400);
  }
  const assetId = body.operationId;

  let unitNumber: string | null;
  let make: string | null;
  let model: string | null;
  let vinInput: string | null;
  let serialNumber: string | null;
  let pin: string | null;
  let siteName: string | null;
  try {
    unitNumber = optionalText(body.unitNumber, 80);
    make = optionalText(body.make, 120);
    model = optionalText(body.model, 120);
    vinInput = optionalText(body.vin, 120);
    serialNumber = optionalText(body.serialNumber, 120);
    pin = optionalText(body.pin, 120);
    siteName = optionalText(body.siteName, 200);
  } catch {
    return json({ error: "One or more Equipment fields are invalid." }, 400);
  }
  if (!unitNumber) return json({ error: "Unit # is required." }, 400);

  let vin: string | null = null;
  if (vinInput) {
    const vinResult = normalizeVinInput(vinInput);
    if (!vinResult.isValid) return json({ error: vinResult.message }, 400);
    vin = vinResult.vin;
  }

  let year: number | null = null;
  if (body.year !== undefined && body.year !== null && body.year !== "") {
    year = Number(body.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return json({ error: "Year must be between 1900 and 2100." }, 400);
    }
  }

  let engineHours: number | null = null;
  if (body.engineHours !== undefined && body.engineHours !== null && body.engineHours !== "") {
    engineHours = Number(body.engineHours);
    if (!Number.isInteger(engineHours) || engineHours < 0) {
      return json({ error: "Current hours must be a non-negative whole number." }, 400);
    }
  }

  const customerId = body.customerId === null || body.customerId === "" ? null : body.customerId;
  if (customerId !== null) {
    if (!isAssetId(customerId)) return json({ error: "Customer is invalid." }, 400);
    const { data: customer, error: customerError } = await access.supabase
      .from("customers")
      .select("id,active,archived_at,merged_into_customer_id")
      .eq("shop_id", access.profile.shop_id)
      .eq("id", customerId)
      .maybeSingle();
    if (customerError) return json({ error: "Customer could not be verified." }, 500);
    if (!customer) return json({ error: "Customer was not found in this shop." }, 400);
    if (!customer.active || customer.archived_at || customer.merged_into_customer_id) {
      return json({ error: "Choose an active customer account before creating Equipment." }, 409);
    }
  }

  const profileValidation = validateEquipmentAssetProfileMutation(
    {
      equipmentClass: body.equipmentClass,
      serialNumber,
      pin,
      primaryMeter: "hours",
      currentCycles: null,
      siteName,
      operatingStatus: body.operatingStatus,
      mountedOnAssetId: null,
      attributes: {},
    },
    "00000000-0000-4000-8000-000000000000",
  );
  if (!profileValidation.ok) return json({ error: profileValidation.error }, 400);

  const mutation = profileValidation.value;
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("create_equipment_asset_atomic", {
    p_shop_id: access.profile.shop_id,
    p_vehicle_id: assetId,
    p_actor_user_id: access.authUserId,
    p_input: {
      customer_id: customerId,
      unit_number: unitNumber,
      year,
      make,
      model,
      vin,
      engine_hours: engineHours,
      profile: {
        equipment_class: mutation.equipmentClass,
        equipment_family: mutation.equipmentFamily,
        serial_number: mutation.serialNumber,
        pin: mutation.pin,
        engine_make: mutation.engineMake,
        engine_model: mutation.engineModel,
        engine_serial: mutation.engineSerial,
        primary_meter: mutation.primaryMeter,
        current_cycles: mutation.currentCycles,
        site_name: mutation.siteName,
        operating_status: mutation.operatingStatus,
        mounted_on_vehicle_id: null,
        attributes: mutation.attributes,
      },
    },
  });

  if (!error && data) return json({ assetId: data }, 201);

  if (error?.code === "23505") {
    return json(
      {
        error: /vin/i.test(error.message) ? DUPLICATE_VIN_MESSAGE : DUPLICATE_UNIT_MESSAGE,
      },
      409,
    );
  }
  if (error?.code === "23514" && /customer/i.test(error.message)) {
    return json({ error: "Choose an active customer account before creating Equipment." }, 409);
  }
  if (error?.code === "23514" && /operation_incomplete/i.test(error.message)) {
    return json(
      {
        error: "The canonical asset exists but Equipment setup did not finish. Use Add existing asset to complete setup.",
        assetId,
        partial: true,
      },
      409,
    );
  }
  if (error?.code === "22023") {
    return json({ error: "One or more Equipment fields are invalid." }, 400);
  }

  console.error("[equipment/assets] atomic create failed", {
    shopId: access.profile.shop_id,
    assetId,
    code: error?.code ?? null,
    message: error?.message ?? "No asset id returned",
  });
  return json({ error: "Equipment could not be created." }, 500);
}
