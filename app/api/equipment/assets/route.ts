export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import {
  isAssetId,
  validateEquipmentAssetProfileMutation,
} from "@/features/equipment/lib/assetProfile";
import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const NO_STORE = { "Cache-Control": "private, no-store" };
const DUPLICATE_UNIT_MESSAGE = "That unit # already exists. Use ‘Add existing asset’ instead.";

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

function deterministicEquipmentAssetId(shopId: string, unitNumber: string): string {
  const digest = createHash("sha256")
    .update(`equipment-asset:${shopId}:${unitNumber.trim().toLowerCase()}`)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type RpcError = { code?: string | null; message: string };

type EquipmentProfileRpc = {
  rpc: (
    fn: "save_equipment_asset_profile",
    args: {
      p_shop_id: string;
      p_vehicle_id: string;
      p_actor_user_id: string;
      p_profile: Record<string, unknown>;
      p_set_engine_hours: boolean;
      p_engine_hours: number | null;
      p_expected_engine_hours: number | null;
      p_set_odometer: boolean;
      p_odometer: string | null;
      p_expected_odometer: string | null;
    },
  ) => Promise<{ error: RpcError | null }>;
};

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ROLE_GROUPS.billingOperators,
  });
  if (!access.ok) return access.response;

  const entitlement = await resolveEquipmentAddonEntitlementForShop(access.profile.shop_id).catch(
    (error) => {
      console.error("[equipment/assets] entitlement failed", {
        shopId: access.profile.shop_id,
        error,
      });
      return null;
    },
  );
  if (!entitlement) {
    return json({ error: "Equipment entitlement could not be verified. Try again." }, 503);
  }
  if (!entitlement.enabled) {
    return json({ error: "An active Equipment subscription is required." }, 403);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Equipment details are required." }, 400);
  }

  let unitNumber: string | null;
  let make: string | null;
  let model: string | null;
  let vin: string | null;
  let serialNumber: string | null;
  let pin: string | null;
  let siteName: string | null;
  try {
    unitNumber = optionalText(body.unitNumber, 80);
    make = optionalText(body.make, 120);
    model = optionalText(body.model, 120);
    vin = optionalText(body.vin, 120);
    serialNumber = optionalText(body.serialNumber, 120);
    pin = optionalText(body.pin, 120);
    siteName = optionalText(body.siteName, 200);
  } catch {
    return json({ error: "One or more Equipment fields are invalid." }, 400);
  }
  if (!unitNumber) return json({ error: "Unit # is required." }, 400);

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
      .select("id")
      .eq("shop_id", access.profile.shop_id)
      .eq("id", customerId)
      .maybeSingle();
    if (customerError) return json({ error: "Customer could not be verified." }, 500);
    if (!customer) return json({ error: "Customer was not found in this shop." }, 400);
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

  const admin = createAdminSupabase();
  const { data: existing, error: duplicateError } = await admin
    .from("vehicles")
    .select("id")
    .eq("shop_id", access.profile.shop_id)
    .eq("unit_number", unitNumber)
    .limit(1);
  if (duplicateError) {
    return json({ error: "Equipment could not be checked for duplicates." }, 500);
  }
  if (existing?.length) return json({ error: DUPLICATE_UNIT_MESSAGE }, 409);

  const assetId = deterministicEquipmentAssetId(access.profile.shop_id, unitNumber);
  const { data: created, error: createError } = await admin
    .from("vehicles")
    .insert({
      id: assetId,
      shop_id: access.profile.shop_id,
      customer_id: customerId,
      unit_number: unitNumber,
      year,
      make,
      model,
      vin,
      engine_hours: engineHours,
    })
    .select("id")
    .single();

  if (createError?.code === "23505") {
    return json({ error: DUPLICATE_UNIT_MESSAGE }, 409);
  }
  if (createError || !created) {
    console.error("[equipment/assets] canonical asset create failed", createError);
    return json({ error: "Equipment could not be created." }, 500);
  }

  const mutation = profileValidation.value;
  const rpcArgs = {
    p_shop_id: access.profile.shop_id,
    p_vehicle_id: created.id,
    p_actor_user_id: access.authUserId,
    p_profile: {
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
    p_set_engine_hours: false,
    p_engine_hours: null,
    p_expected_engine_hours: null,
    p_set_odometer: false,
    p_odometer: null,
    p_expected_odometer: null,
  };

  const { error: profileError } = await (admin as unknown as EquipmentProfileRpc).rpc(
    "save_equipment_asset_profile",
    rpcArgs,
  );
  if (!profileError) return json({ assetId: created.id }, 201);

  // The RPC may have committed even if the client lost the readback. Never
  // compensate by deleting until persistence has been checked definitively.
  const { data: persistedProfile, error: verificationError } = await admin
    .from("equipment_asset_profiles")
    .select("vehicle_id")
    .eq("shop_id", access.profile.shop_id)
    .eq("vehicle_id", created.id)
    .maybeSingle();

  if (persistedProfile) {
    console.warn("[equipment/assets] profile RPC reported failure after persistence", {
      assetId: created.id,
      code: profileError.code ?? null,
      message: profileError.message,
    });
    return json({ assetId: created.id }, 201);
  }

  if (verificationError) {
    console.error("[equipment/assets] profile persistence could not be verified", {
      assetId: created.id,
      profileError,
      verificationError,
    });
    return json(
      {
        error:
          "Equipment creation status could not be verified. Reload Equipment before trying again.",
      },
      500,
    );
  }

  const { error: cleanupError } = await admin
    .from("vehicles")
    .delete()
    .eq("shop_id", access.profile.shop_id)
    .eq("id", created.id);
  if (cleanupError) {
    console.error("[equipment/assets] failed to clean up incomplete asset", {
      assetId: created.id,
      cleanupError,
    });
  }

  console.error("[equipment/assets] profile creation failed", {
    assetId: created.id,
    code: profileError.code ?? null,
    message: profileError.message,
  });
  return json({ error: "Equipment could not be created." }, 500);
}
