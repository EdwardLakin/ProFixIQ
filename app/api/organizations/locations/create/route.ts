export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";

import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const locationSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    address: z.string().trim().min(3).max(240),
    city: z.string().trim().min(1).max(120),
    province: z.string().trim().min(1).max(120),
    postalCode: z.string().trim().min(2).max(24),
    country: z.enum(["CA", "US"]),
    timezone: z.string().trim().min(3).max(80),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().email().max(254).optional(),
    locationType: z
      .enum([
        "repair_facility",
        "mobile_service_branch",
        "parts_depot",
        "administrative_office",
      ])
      .default("repair_facility"),
  })
  .strict();

type ShopOrganizationScope = Pick<
  Database["public"]["Tables"]["shops"]["Row"],
  "id" | "organization_id"
>;

type CreatedLocation = {
  id: string;
  shop_name: string | null;
  organization_id: string | null;
  billing_entitlement_override: string | null;
  stripe_subscription_status: string | null;
};

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageBilling",
    allowRoles: ["owner", "admin"],
    requireOwnerPin: true,
    ownerPinRequest: req,
    ownerPinAllowedPurposes: [OWNER_PIN_PURPOSES.PRIVILEGED],
  });
  if (!access.ok) return access.response;

  const parsed = locationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid location name and operating address." },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase();
  const { data: currentShop, error: currentShopError } = await admin
    .from("shops")
    .select("id, organization_id")
    .eq("id", access.profile.shop_id)
    .maybeSingle<ShopOrganizationScope>();

  if (currentShopError || !currentShop) {
    return NextResponse.json({ error: "Current shop not found." }, { status: 404 });
  }

  if (!currentShop.organization_id) {
    return NextResponse.json(
      {
        error:
          "Create the organization from Shop Settings before adding another location.",
        code: "organization_required",
      },
      { status: 409 },
    );
  }

  const input = parsed.data;
  const now = new Date().toISOString();
  const locationPayload = {
    name: input.name,
    shop_name: input.name,
    address: input.address,
    street: input.address,
    city: input.city,
    province: input.province,
    postal_code: input.postalCode,
    country: input.country,
    timezone: input.timezone,
    phone_number: input.phone ?? null,
    email: input.email ?? null,
    organization_id: currentShop.organization_id,
    owner_id: access.authUserId,
    created_by: access.authUserId,
    plan: "starter",
    stripe_subscription_status: null,
    billing_entitlement_override: "read_only",
    billing_entitlement_updated_at: now,
    location_type: input.locationType,
  };

  const { data: location, error: createError } = await admin
    .from("shops")
    .insert(locationPayload as never)
    .select(
      "id, shop_name, organization_id, billing_entitlement_override, stripe_subscription_status",
    )
    .single<CreatedLocation>();

  if (createError || !location) {
    return NextResponse.json(
      { error: createError?.message ?? "Failed to create location." },
      { status: 500 },
    );
  }

  const { error: membershipError } = await admin.from("shop_members").upsert(
    {
      shop_id: location.id,
      user_id: access.authUserId,
      role: access.canonicalRole,
      created_by: access.authUserId,
    } as Database["public"]["Tables"]["shop_members"]["Insert"],
    { onConflict: "shop_id,user_id" },
  );

  if (membershipError) {
    await admin.from("shops").delete().eq("id", location.id);
    return NextResponse.json(
      { error: "Location membership could not be created." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      location,
      billingRequired: true,
      next: `/api/organizations/locations/${location.id}/checkout`,
    },
    { status: 201 },
  );
}
