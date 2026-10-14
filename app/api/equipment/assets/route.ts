export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  isAssetId,
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

function serviceFailure(error: unknown) {
  if (error instanceof EquipmentAssetProfileError) {
    return json({ error: error.message }, error.status);
  }
  console.error("[equipment/assets] create failed", error);
  return json({ error: "Equipment could not be created." }, 500);
}

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
  let serialNumber: string | null;
  let pin: string | null;
  let siteName: string | null;
  try {
    unitNumber = optionalText(body.unitNumber, 80);
    make = optionalText(body.make, 120);
    model = optionalText(body.model, 120);
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
  if (duplicateError) return json({ error: "Equipment could not be checked for duplicates." }, 500);
  if (existing?.length) {
    return json(
      { error: "That unit # already exists. Use ‘Add existing asset’ instead." },
      409,
    );
  }

  const { data: created, error: createError } = await admin
    .from("vehicles")
    .insert({
      shop_id: access.profile.shop_id,
      customer_id: customerId,
      unit_number: unitNumber,
      year,
      make,
      model,
      engine_hours: engineHours,
    })
    .select("id")
    .single();

  if (createError || !created) {
    console.error("[equipment/assets] canonical asset create failed", createError);
    return json({ error: "Equipment could not be created." }, 500);
  }

  try {
    await saveEquipmentAssetProfile({
      supabase: access.supabase,
      admin,
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      assetId: created.id,
      mutation: profileValidation.value,
    });
    return json({ assetId: created.id }, 201);
  } catch (error) {
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
    return serviceFailure(error);
  }
}
