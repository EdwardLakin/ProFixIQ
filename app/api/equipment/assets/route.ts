export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  validateEquipmentAssetProfileMutation,
} from "@/features/equipment/lib/assetProfile";
import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";
import {
  EquipmentAssetProfileError,
  saveEquipmentAssetProfile,
} from "@/features/equipment/server/equipmentAssetProfileService";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";

const NO_STORE = { "Cache-Control": "private, no-store" };

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
  if (!body || Array.isArray(body)) return json({ error: "Equipment details are required." }, 400);

  let unitNumber: string | null;
  let make: string | null;
  let model: string | null;
  let vinInput: string | null;
  try {
    unitNumber = optionalText(body.unitNumber, 80);
    make = optionalText(body.make, 120);
    model = optionalText(body.model, 120);
    vinInput = optionalText(body.vin, 120);
  } catch {
    return json({ error: "One or more Equipment fields are invalid." }, 400);
  }
  if (!unitNumber) return json({ error: "Unit # is required." }, 400);

  let vin: string | null = null;
  if (vinInput) {
    const normalized = normalizeVinInput(vinInput);
    if (!normalized.isValid) return json({ error: normalized.message }, 400);
    vin = normalized.vin;
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
  if (customerId !== null && typeof customerId !== "string") {
    return json({ error: "Customer is invalid." }, 400);
  }

  if (customerId) {
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
      serialNumber: body.serialNumber,
      pin: body.pin,
      primaryMeter: "hours",
      currentCycles: null,
      siteName: body.siteName,
      operatingStatus: body.operatingStatus,
      mountedOnAssetId: null,
      attributes: {},
    },
    "00000000-0000-4000-8000-000000000000",
  );
  if (!profileValidation.ok) return json({ error: profileValidation.error }, 400);

  // `vehicles` is the canonical record. This follows the same direct insert
  // contract used by the existing Shop/Fleet/portal/import creation paths.
  const { data: vehicle, error: vehicleError } = await access.supabase
    .from("vehicles")
    .insert({
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

  if (vehicleError || !vehicle) {
    console.error("[equipment/assets] canonical vehicle create failed", {
      shopId: access.profile.shop_id,
      error: vehicleError,
    });
    return json({ error: "The canonical asset could not be created." }, 500);
  }

  try {
    await saveEquipmentAssetProfile({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      assetId: vehicle.id,
      mutation: profileValidation.value,
    });
    return json({ assetId: vehicle.id }, 201);
  } catch (error) {
    // Never delete the canonical vehicle because Equipment profile setup failed.
    // The vehicle remains the source of truth and can be enabled through the
    // existing-asset path on the next attempt.
    if (error instanceof EquipmentAssetProfileError) {
      return json(
        {
          error: `${error.message} The canonical asset was kept; use Add existing asset to finish Equipment setup.`,
          assetId: vehicle.id,
          partial: true,
        },
        error.status >= 500 ? 500 : 409,
      );
    }
    console.error("[equipment/assets] profile attach failed", {
      shopId: access.profile.shop_id,
      assetId: vehicle.id,
      error,
    });
    return json(
      {
        error: "The canonical asset was created, but Equipment setup did not finish. Use Add existing asset to finish setup.",
        assetId: vehicle.id,
        partial: true,
      },
      500,
    );
  }
}
