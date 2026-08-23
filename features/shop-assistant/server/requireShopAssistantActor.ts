import "server-only";

import type {
  ActorCapabilities,
  CanonicalRole,
} from "@/features/shared/lib/rbac";
import {
  canAccessShopAssistant,
  canonicalizeRole,
  getActorCapabilities,
  resolveFleetRoleTier,
} from "@/features/shared/lib/rbac";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { toSafeDatabaseError } from "@/features/shared/lib/server/safeDatabaseError";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";
import { resolveCurrentWorkspaceCapabilities } from "@/features/workspace/authorization/server/resolveWorkspaceCapabilities";

export class ShopAssistantHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ShopAssistantHttpError";
    this.status = status;
  }
}

export type ShopAssistantActor = {
  userId: string;
  profileId: string;
  shopId: string;
  role: string | null;
  canonicalRole: CanonicalRole;
  capabilities: ActorCapabilities;
  supabase: ReturnType<typeof createServerSupabaseRoute>;
};

export async function requireShopAssistantActor(
  supabase = createServerSupabaseRoute(),
): Promise<ShopAssistantActor> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ShopAssistantHttpError(401, "Unauthorized");
  }

  const { profile, error: profileError } =
    await resolveAuthenticatedStaffProfile(supabase, user.id);

  if (profileError || !profile?.shop_id) {
    throw new ShopAssistantHttpError(403, "A shop staff profile is required");
  }

  const canonicalRole = canonicalizeRole(profile.role);
  if (!canAccessShopAssistant(canonicalRole)) {
    throw new ShopAssistantHttpError(
      403,
      "Your role does not have access to the shop-wide assistant",
    );
  }

  // fleet_members.user_id references the canonical profiles.id, which is not
  // necessarily the same value as auth.uid() for imported staff accounts.
  const { data: fleetMemberships, error: fleetMembershipError } =
    await createAdminSupabase()
      .from("fleet_members")
      .select("role")
      .eq("user_id", profile.id)
      .eq("shop_id", profile.shop_id);
  if (fleetMembershipError) {
    throw new Error(fleetMembershipError.message);
  }
  const fleetTierRank = {
    none: 0,
    viewer: 1,
    approver: 2,
    manager: 3,
  } as const;
  const strongestFleetRole = (fleetMemberships ?? []).reduce<string | null>(
    (strongest, membership) =>
      fleetTierRank[resolveFleetRoleTier(membership.role)] >
      fleetTierRank[resolveFleetRoleTier(strongest)]
        ? membership.role
        : strongest,
    null,
  );
  const roleCapabilities = getActorCapabilities({
    role: profile.role,
    fleetRole: strongestFleetRole,
  });
  const workspaceAccess = await resolveCurrentWorkspaceCapabilities({
    supabase,
    profileId: profile.id,
    shopId: profile.shop_id,
    capabilityKeys: [WORKSPACE_CAPABILITIES.manageWorkOrderAssignments],
  });
  const capabilities: ActorCapabilities = {
    ...roleCapabilities,
    // Assignment is the first Workspace capability migrated end to end. A
    // resolver error fails this one action closed without disabling unrelated
    // assistant reads and tools.
    canAssignWork:
      workspaceAccess.error === null &&
      workspaceAccess.capabilities[
        WORKSPACE_CAPABILITIES.manageWorkOrderAssignments
      ].granted,
  };

  return {
    userId: user.id,
    profileId: profile.id,
    shopId: profile.shop_id,
    role: profile.role,
    canonicalRole,
    capabilities,
    supabase,
  };
}

export function resolveShopAssistantError(
  error: unknown,
  context = "shop-assistant",
): { status: number; message: string; retryable: boolean } {
  if (error instanceof ShopAssistantHttpError) {
    return {
      status: error.status,
      message: error.message,
      retryable: error.status >= 500,
    };
  }
  if (error instanceof Error && error.name === "ZodError") {
    return {
      status: 400,
      message: "The request is missing or contains an invalid value.",
      retryable: false,
    };
  }
  if (error instanceof Error && error.name === "AiOperationalTimeoutError") {
    return {
      status: 503,
      message: "Current shop data took too long to load. Please try again.",
      retryable: true,
    };
  }

  const safe = toSafeDatabaseError(
    error instanceof Error ? error : { message: String(error ?? "") },
    {
      context,
      fallback: "The shop assistant could not complete that request.",
    },
  );
  return {
    status: 500,
    message: `${safe.message} Reference ${safe.correlationId}.`,
    retryable: true,
  };
}
