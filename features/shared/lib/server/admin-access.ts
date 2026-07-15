import "server-only";

import { redirect } from "next/navigation";
import type { Database } from "@shared/types/types/supabase";
import { createServerSupabaseRSC, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities, type ActorCapabilities, type CanonicalRole } from "@/features/shared/lib/rbac";
import { OWNER_PIN_PURPOSES, type OwnerPinPurpose, requireOwnerPinVerified } from "@/features/shared/lib/server/owner-pin";
import { NextResponse } from "next/server";

type DB = Database;
type ProfileScope = Pick<DB["public"]["Tables"]["profiles"]["Row"], "id" | "role" | "shop_id">;
type ShopScopedProfile = Omit<ProfileScope, "shop_id"> & { shop_id: string };

type CapabilityKey = keyof ActorCapabilities;

type ShopPageAccessOptions = {
  allowRoles?: readonly CanonicalRole[];
  requiredCapability?: CapabilityKey;
  requiredCapabilities?: readonly CapabilityKey[];
  redirectTo?: string;
};

export async function requireShopPageAccess(options: ShopPageAccessOptions): Promise<{
  profile: ShopScopedProfile;
  canonicalRole: CanonicalRole;
}> {
  const supabase = createServerSupabaseRSC();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle<ProfileScope>();

  const actor = getActorCapabilities({ role: profile?.role });
  const role = actor.canonicalRole;
  const allowedRole = !options.allowRoles || options.allowRoles.includes(role);
  const allowedCapability = !options.requiredCapability || actor[options.requiredCapability];
  const allowedCapabilities =
    !options.requiredCapabilities?.length ||
    options.requiredCapabilities.every((capability) => actor[capability]);

  if (
    !profile ||
    !profile.shop_id ||
    !actor.isKnownRole ||
    !allowedRole ||
    !allowedCapability ||
    !allowedCapabilities
  ) {
    redirect(options.redirectTo ?? "/dashboard");
  }

  return {
    profile: { ...profile, shop_id: profile.shop_id },
    canonicalRole: role,
  };
}

export async function requireAdminPageAccess(options: {
  allow: readonly CanonicalRole[];
  redirectTo?: string;
}) {
  return requireShopPageAccess({
    allowRoles: options.allow,
    redirectTo: options.redirectTo,
  });
}

type ApiAccessOptions = {
  requiredCapability?: CapabilityKey;
  requiredCapabilities?: readonly CapabilityKey[];
  allowRoles?: readonly CanonicalRole[];
  requireOwnerPin?: boolean;
  ownerPinRequest?: Request;
  ownerPinAllowedPurposes?: OwnerPinPurpose[];
};

export async function requireShopScopedApiAccess(options: ApiAccessOptions = {}): Promise<
  | {
      ok: true;
      profile: ShopScopedProfile;
      canonicalRole: CanonicalRole;
      supabase: ReturnType<typeof createServerSupabaseRoute>;
    }
  | { ok: false; response: NextResponse }
> {
  const supabase = createServerSupabaseRoute();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { ok: false, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle<ProfileScope>();

  if (profileErr || !profile || !profile.shop_id) {
    return { ok: false, response: NextResponse.json({ error: "Profile for current user not found" }, { status: 403 }) };
  }

  const actor = getActorCapabilities({ role: profile.role });
  const canonicalRole = actor.canonicalRole;

  // This is a staff/shop boundary helper. Unrecognized profile roles must never
  // inherit access merely because the profile happens to contain a shop_id.
  if (!actor.isKnownRole) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (options.allowRoles && !options.allowRoles.includes(canonicalRole)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (options.requiredCapability && !actor[options.requiredCapability]) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (options.requiredCapabilities?.length) {
    const hasAllRequiredCapabilities = options.requiredCapabilities.every(
      (capability) => actor[capability],
    );

    if (!hasAllRequiredCapabilities) {
      return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
  }

  if (options.requireOwnerPin) {
    if (!options.ownerPinRequest) {
      return { ok: false, response: NextResponse.json({ error: "Owner PIN request context missing" }, { status: 500 }) };
    }
    const pinCheck = await requireOwnerPinVerified(options.ownerPinRequest, supabase as never, {
      shopId: profile.shop_id,
      userId: user.id,
      allowedPurposes: options.ownerPinAllowedPurposes ?? [OWNER_PIN_PURPOSES.PRIVILEGED],
    });
    if (!pinCheck.ok) return { ok: false, response: pinCheck.response };
  }

  return {
    ok: true,
    profile: { ...profile, shop_id: profile.shop_id },
    canonicalRole,
    supabase,
  };
}
