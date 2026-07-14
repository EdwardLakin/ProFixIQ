import "server-only";

import { redirect } from "next/navigation";
import type { Database } from "@shared/types/types/supabase";
import { createServerSupabaseRSC, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { canonicalizeRole, getActorCapabilities, type ActorCapabilities, type CanonicalRole } from "@/features/shared/lib/rbac";
import { OWNER_PIN_PURPOSES, type OwnerPinPurpose, requireOwnerPinVerified } from "@/features/shared/lib/server/owner-pin";
import { NextResponse } from "next/server";

type DB = Database;
type ProfileScope = Pick<DB["public"]["Tables"]["profiles"]["Row"], "id" | "role" | "shop_id">;
type ShopScopedProfile = Omit<ProfileScope, "shop_id"> & { shop_id: string };

type CapabilityKey = keyof ActorCapabilities;

type AdminPageAccessOptions = {
  allow: CanonicalRole[];
  redirectTo?: string;
};

export async function requireAdminPageAccess(options: AdminPageAccessOptions): Promise<{
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

  const role = canonicalizeRole(profile?.role);
  const allowed = options.allow.includes(role);

  if (!profile || !profile.shop_id || !allowed) {
    redirect(options.redirectTo ?? "/dashboard");
  }

  return {
    profile: { ...profile, shop_id: profile.shop_id },
    canonicalRole: role,
  };
}

type ApiAccessOptions = {
  requiredCapability?: CapabilityKey;
  requiredCapabilities?: CapabilityKey[];
  allowRoles?: CanonicalRole[];
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
