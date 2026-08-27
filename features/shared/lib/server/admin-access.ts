import "server-only";

import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  resolveCanonicalStaffProfile,
  type AuthenticatedStaffProfile,
} from "@/features/shared/lib/authenticated-profile";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  getActorCapabilities,
  type ActorCapabilities,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";
import {
  productAccessSignInHref,
  resolveShopProductAccess,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";
import type { ProductCapability } from "@/features/stripe/lib/stripe/product-packages";
import {
  OWNER_PIN_PURPOSES,
  type OwnerPinPurpose,
  requireOwnerPinVerified,
} from "@/features/shared/lib/server/owner-pin";
import type { WorkspaceCapabilityKey } from "@/features/workspace/authorization/capabilities";
import { resolveCurrentWorkspaceCapabilities } from "@/features/workspace/authorization/server/resolveWorkspaceCapabilities";

type ProfileScope = AuthenticatedStaffProfile;
type ShopScopedProfile = Omit<ProfileScope, "shop_id"> & { shop_id: string };

type CapabilityKey = keyof ActorCapabilities;
type ServerSupabase =
  | ReturnType<typeof createServerSupabaseRSC>
  | ReturnType<typeof createServerSupabaseRoute>;

/**
 * Resolve the canonical staff profile for an authenticated user.
 *
 * New profiles normally use the auth user id as their profile id, while
 * imported/legacy profiles can retain a separate profile id and link through
 * profiles.user_id. Workforce records reference profiles.id, so callers must
 * always receive the canonical profile row rather than assume both ids match.
 */
export async function resolveAuthenticatedStaffProfile(
  supabase: ServerSupabase,
  authUserId: string,
): Promise<{ profile: ProfileScope | null; error: string | null }> {
  // profiles.self.read historically only matched profiles.id = auth.uid().
  // Imported staff can instead retain a canonical profile id while linking
  // their Supabase account through profiles.user_id. Keep an exact service
  // fallback for deployments that have not yet installed linked self-read RLS.
  return resolveCanonicalStaffProfile(supabase, authUserId, {
    linkedProfileClient: createAdminSupabase,
  });
}

type ShopPageAccessOptions = {
  allowRoles?: readonly CanonicalRole[];
  /**
   * Lets a role outside allowRoles enter when this effective Workspace
   * capability is granted. Static allowed roles do not depend on the resolver.
   */
  allowRolesOrWorkspaceCapability?: WorkspaceCapabilityKey;
  requiredCapability?: CapabilityKey;
  requiredCapabilities?: readonly CapabilityKey[];
  requiredWorkspaceCapability?: WorkspaceCapabilityKey;
  /**
   * Product packages that may authorize this tenant-scoped surface.
   * Shop is the secure default. Use an empty list only for non-operational
   * account recovery, never as a role/capability bypass.
   */
  requiredProductCapabilities?: readonly ProductCapability[];
  redirectTo?: string;
};

export async function requireShopPageAccess(
  options: ShopPageAccessOptions,
): Promise<{
  profile: ShopScopedProfile;
  canonicalRole: CanonicalRole;
}> {
  const supabase = createServerSupabaseRSC();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { profile } = await resolveAuthenticatedStaffProfile(supabase, user.id);

  const actor = getActorCapabilities({ role: profile?.role });
  const role = actor.canonicalRole;
  const requiredProductCapabilities =
    options.requiredProductCapabilities ?? SHOP_PRODUCT_CAPABILITIES;
  const productAccess =
    profile?.shop_id && actor.isKnownRole
      ? await resolveShopProductAccess({
          supabase,
          shopId: profile.shop_id,
          capabilities: requiredProductCapabilities,
        })
      : null;
  const allowedRole = !options.allowRoles || options.allowRoles.includes(role);
  const allowedCapability =
    !options.requiredCapability || actor[options.requiredCapability];
  const allowedCapabilities =
    !options.requiredCapabilities?.length ||
    options.requiredCapabilities.every((capability) => actor[capability]);

  const roleAlternativeAccess =
    profile?.shop_id &&
    options.allowRoles &&
    !allowedRole &&
    options.allowRolesOrWorkspaceCapability
      ? await resolveCurrentWorkspaceCapabilities({
          supabase,
          profileId: profile.id,
          shopId: profile.shop_id,
          capabilityKeys: [options.allowRolesOrWorkspaceCapability],
        })
      : null;
  const allowedRoleOrWorkspaceCapability =
    allowedRole ||
    Boolean(
      options.allowRolesOrWorkspaceCapability &&
        roleAlternativeAccess?.error === null &&
        roleAlternativeAccess.capabilities[
          options.allowRolesOrWorkspaceCapability
        ].granted,
    );

  const workspaceAccess =
    profile?.shop_id && options.requiredWorkspaceCapability
      ? await resolveCurrentWorkspaceCapabilities({
          supabase,
          profileId: profile.id,
          shopId: profile.shop_id,
          capabilityKeys: [options.requiredWorkspaceCapability],
        })
      : null;
  const allowedWorkspaceCapability =
    !options.requiredWorkspaceCapability ||
    (workspaceAccess?.error === null &&
      workspaceAccess.capabilities[options.requiredWorkspaceCapability].granted);

  if (
    !profile ||
    !profile.shop_id ||
    !actor.isKnownRole ||
    !allowedRoleOrWorkspaceCapability ||
    !allowedCapability ||
    !allowedCapabilities ||
    !allowedWorkspaceCapability
  ) {
    redirect(options.redirectTo ?? "/dashboard");
  }

  if (productAccess?.error || !productAccess?.entitled) {
    redirect(productAccessSignInHref(requiredProductCapabilities));
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
  requiredWorkspaceCapability?: WorkspaceCapabilityKey;
  allowRoles?: readonly CanonicalRole[];
  requireOwnerPin?: boolean;
  ownerPinRequest?: Request;
  ownerPinAllowedPurposes?: OwnerPinPurpose[];
  /** See ShopPageAccessOptions.requiredProductCapabilities. */
  requiredProductCapabilities?: readonly ProductCapability[];
};

export async function requireShopScopedApiAccess(
  options: ApiAccessOptions = {},
): Promise<
  | {
      ok: true;
      profile: ShopScopedProfile;
      canonicalRole: CanonicalRole;
      authUserId: string;
      supabase: ReturnType<typeof createServerSupabaseRoute>;
    }
  | { ok: false; response: NextResponse }
> {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      ),
    };
  }

  const { profile, error: profileErr } = await resolveAuthenticatedStaffProfile(
    supabase,
    user.id,
  );

  if (profileErr || !profile || !profile.shop_id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Profile for current user not found" },
        { status: 403 },
      ),
    };
  }

  const actor = getActorCapabilities({ role: profile.role });
  const canonicalRole = actor.canonicalRole;

  // This is a staff/shop boundary helper. Unrecognized profile roles must never
  // inherit access merely because the profile happens to contain a shop_id.
  if (!actor.isKnownRole) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const requiredProductCapabilities =
    options.requiredProductCapabilities ?? SHOP_PRODUCT_CAPABILITIES;
  const productAccess = await resolveShopProductAccess({
    supabase,
    shopId: profile.shop_id,
    capabilities: requiredProductCapabilities,
  });

  if (productAccess.error) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authorization service unavailable" },
        { status: 503 },
      ),
    };
  }

  if (!productAccess.entitled) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Product access required" },
        { status: 403 },
      ),
    };
  }

  if (options.allowRoles && !options.allowRoles.includes(canonicalRole)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  if (options.requiredCapability && !actor[options.requiredCapability]) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  if (options.requiredCapabilities?.length) {
    const hasAllRequiredCapabilities = options.requiredCapabilities.every(
      (capability) => actor[capability],
    );

    if (!hasAllRequiredCapabilities) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
  }

  if (options.requiredWorkspaceCapability) {
    const workspaceAccess = await resolveCurrentWorkspaceCapabilities({
      supabase,
      profileId: profile.id,
      shopId: profile.shop_id,
      capabilityKeys: [options.requiredWorkspaceCapability],
    });

    if (workspaceAccess.error) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Authorization service unavailable" },
          { status: 503 },
        ),
      };
    }

    if (
      !workspaceAccess.capabilities[options.requiredWorkspaceCapability].granted
    ) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
  }

  if (options.requireOwnerPin) {
    if (!options.ownerPinRequest) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Owner PIN request context missing" },
          { status: 500 },
        ),
      };
    }
    const pinCheck = await requireOwnerPinVerified(
      options.ownerPinRequest,
      supabase as never,
      {
        shopId: profile.shop_id,
        userId: user.id,
        allowedPurposes: options.ownerPinAllowedPurposes ?? [
          OWNER_PIN_PURPOSES.PRIVILEGED,
        ],
      },
    );
    if (!pinCheck.ok) return { ok: false, response: pinCheck.response };
  }

  return {
    ok: true,
    profile: { ...profile, shop_id: profile.shop_id },
    canonicalRole,
    authUserId: user.id,
    supabase,
  };
}
