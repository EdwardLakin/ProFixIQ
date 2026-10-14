export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "node:crypto";
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

type RpcError = { code?: string | null; message: string };
type EquipmentProfileRpc = {
  rpc: (
    fn: "save_equipment_asset_profile",
    args: Record<string, unknown>,
  ) => Promise<{ error: RpcError | null }>;
};

type DuplicateRow = {
  id: string;
  created_at: string | null;
  unit_number: string | null;
  vin: string | null;
};

function normalizeUnit(value: string | null): string | null {
  return value?.trim().toLowerCase() || null;
}

function normalizeStoredVin(value: string | null): string | null {
  if (!value) return null;
  return normalizeVinInput(value).vin || value.trim().toUpperCase();
}

function isExactDuplicate(row: DuplicateRow, unitNumber: string, vin: string | null): boolean {
  return (
    normalizeUnit(row.unit_number) === normalizeUnit(unitNumber) ||
    (!!vin && normalizeStoredVin(row.vin) === vin)
  );
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

  const admin = createAdminSupabase();
  const loadDuplicates = async (): Promise<{ rows: DuplicateRow[]; error: unknown | null }> => {
    const [unitResult, vinResult] = await Promise.all([
      admin
        .from("vehicles")
        .select("id,created_at,unit_number,vin")
        .eq("shop_id", access.profile.shop_id)
        .ilike("unit_number", unitNumber!),
      vin
        ? admin
            .from("vehicles")
            .select("id,created_at,unit_number,vin")
            .eq("shop_id", access.profile.shop_id)
            .eq("vin", vin)
        : Promise.resolve({ data: [] as DuplicateRow[], error: null }),
    ]);
    if (unitResult.error || vinResult.error) {
      return { rows: [], error: unitResult.error ?? vinResult.error };
    }
    const byId = new Map<string, DuplicateRow>();
    for (const row of [...((unitResult.data ?? []) as DuplicateRow[]), ...((vinResult.data ?? []) as DuplicateRow[])]) {
      byId.set(row.id, row);
    }
    return { rows: Array.from(byId.values()), error: null };
  };

  const before = await loadDuplicates();
  if (before.error) return json({ error: "Equipment could not be checked for duplicates." }, 500);
  const beforeExact = before.rows.filter((row) => isExactDuplicate(row, unitNumber!, vin));
  if (beforeExact.some((row) => normalizeUnit(row.unit_number) === normalizeUnit(unitNumber))) {
    return json({ error: DUPLICATE_UNIT_MESSAGE }, 409);
  }
  if (vin && beforeExact.some((row) => normalizeStoredVin(row.vin) === vin)) {
    return json({ error: DUPLICATE_VIN_MESSAGE }, 409);
  }

  const assetId = randomUUID();
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
      engine_hours: null,
    })
    .select("id,created_at")
    .single();
  if (createError || !created) {
    console.error("[equipment/assets] canonical asset create failed", createError);
    return json({ error: "Equipment could not be created." }, 500);
  }

  const after = await loadDuplicates();
  if (after.error) {
    const { error: cleanupError } = await admin
      .from("vehicles")
      .delete()
      .eq("shop_id", access.profile.shop_id)
      .eq("id", created.id);
    if (cleanupError) {
      console.error("[equipment/assets] duplicate verification and cleanup failed", {
        assetId: created.id,
        duplicateError: after.error,
        cleanupError,
      });
      return json(
        {
          error: "Equipment duplicate status could not be verified and the new asset could not be cleaned up. Use Add existing asset before retrying.",
          assetId: created.id,
          partial: true,
        },
        500,
      );
    }
    return json({ error: "Equipment duplicate status could not be verified. Try again." }, 500);
  }

  const contenders = after.rows
    .filter((row) => isExactDuplicate(row, unitNumber!, vin))
    .sort((a, b) => `${a.created_at ?? ""}:${a.id}`.localeCompare(`${b.created_at ?? ""}:${b.id}`));
  const winner = contenders[0];
  if (winner && winner.id !== created.id) {
    const { error: cleanupError } = await admin
      .from("vehicles")
      .delete()
      .eq("shop_id", access.profile.shop_id)
      .eq("id", created.id);
    if (cleanupError) {
      console.error("[equipment/assets] duplicate loser cleanup failed", {
        assetId: created.id,
        winnerId: winner.id,
        cleanupError,
      });
      return json(
        {
          error: "A duplicate asset was detected but the new record could not be cleaned up. Use Add existing asset and review the duplicate before retrying.",
          assetId: created.id,
          partial: true,
        },
        500,
      );
    }
    const vinConflict = vin && normalizeStoredVin(winner.vin) === vin;
    return json({ error: vinConflict ? DUPLICATE_VIN_MESSAGE : DUPLICATE_UNIT_MESSAGE }, 409);
  }

  const mutation = profileValidation.value;
  const { error: profileError } = await (admin as unknown as EquipmentProfileRpc).rpc(
    "save_equipment_asset_profile",
    {
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
      p_set_engine_hours: engineHours !== null,
      p_engine_hours: engineHours,
      p_expected_engine_hours: null,
      p_set_odometer: false,
      p_odometer: null,
      p_expected_odometer: null,
    },
  );
  if (!profileError) return json({ assetId: created.id }, 201);

  const { data: persistedProfile, error: verificationError } = await admin
    .from("equipment_asset_profiles")
    .select("vehicle_id")
    .eq("shop_id", access.profile.shop_id)
    .eq("vehicle_id", created.id)
    .maybeSingle();
  if (persistedProfile) return json({ assetId: created.id }, 201);
  if (verificationError) {
    console.error("[equipment/assets] profile persistence could not be verified", { assetId: created.id, profileError, verificationError });
    return json({ error: "Equipment creation status could not be verified. Reload Equipment before trying again." }, 500);
  }

  const { error: cleanupError } = await admin
    .from("vehicles")
    .delete()
    .eq("shop_id", access.profile.shop_id)
    .eq("id", created.id);
  if (cleanupError) {
    console.error("[equipment/assets] failed to clean up incomplete asset", {
      assetId: created.id,
      profileError,
      cleanupError,
    });
    return json(
      {
        error: "The Equipment profile could not be created and the new asset could not be cleaned up. Use Add existing asset to finish setup before retrying.",
        assetId: created.id,
        partial: true,
      },
      500,
    );
  }

  console.error("[equipment/assets] profile creation failed", { assetId: created.id, code: profileError.code ?? null, message: profileError.message });
  return json({ error: "Equipment could not be created." }, 500);
}
