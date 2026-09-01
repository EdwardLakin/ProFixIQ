import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  canonicalizeRole,
  getActorCapabilities,
  resolveFleetRoleTier,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";

type DB = Database;
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type FleetMemberRow = DB["public"]["Tables"]["fleet_members"]["Row"];

export type FleetMembershipContext = {
  fleetId: string;
  shopId: string | null;
  role: string | null;
};

export type FleetActorType =
  | "internal_staff"
  | "fleet_manager"
  | "fleet_dispatcher"
  | "fleet_driver"
  | "none";

export type FleetActorCapabilities = {
  canSeeFleetWideUnits: boolean;
  canCreatePretripReports: boolean;
  canConvertPretripToServiceRequest: boolean;
  canAccessFleetIntake: boolean;
  canAccessPortalFleetWrappers: boolean;
  canRunFleetDispatchActions: boolean;
  canOverrideShopScope: boolean;
};

export type FleetActorContext = {
  userId: string | null;
  actorType: FleetActorType;
  canonicalRole: CanonicalRole;
  profileRole: ProfileRow["role"] | null;
  profileShopId: string | null;
  shopId: string | null;
  fleetIds: string[];
  fleetMemberships: FleetMembershipContext[];
  primaryFleetId: string | null;
  membershipRole: string | null;
  isInternal: boolean;
  isFleetActor: boolean;
  capabilities: FleetActorCapabilities;
};

type ResolveFleetActorContextOptions = {
  userId?: string;
  /** Canonical profiles.id when the caller has already resolved it. */
  profileId?: string;
  requestedFleetId?: string | null;
};

const INTERNAL_STAFF_ROLES: CanonicalRole[] = [
  "owner",
  "admin",
  "manager",
  "advisor",
];

function uniqueStrings(input: Array<string | null | undefined>): string[] {
  return Array.from(new Set(input.filter((value): value is string => !!value)));
}

export async function resolveFleetActorContext(
  supabase: SupabaseClient<DB>,
  options?: ResolveFleetActorContextOptions,
): Promise<FleetActorContext> {
  const userId =
    options?.userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;

  if (!userId) {
    return {
      userId: null,
      actorType: "none",
      canonicalRole: "unknown",
      profileRole: null,
      profileShopId: null,
      shopId: null,
      fleetIds: [],
      fleetMemberships: [],
      primaryFleetId: null,
      membershipRole: null,
      isInternal: false,
      isFleetActor: false,
      capabilities: {
        canSeeFleetWideUnits: false,
        canCreatePretripReports: false,
        canConvertPretripToServiceRequest: false,
        canAccessFleetIntake: false,
        canAccessPortalFleetWrappers: false,
        canRunFleetDispatchActions: false,
        canOverrideShopScope: false,
      },
    };
  }

  const profileById = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", options?.profileId ?? userId)
    .maybeSingle();
  const profileByAuthUser =
    !profileById.error && !profileById.data && !options?.profileId
      ? await supabase
          .from("profiles")
          .select("id, role, shop_id")
          .eq("user_id", userId)
          .maybeSingle()
      : null;
  const profile = profileById.data ?? profileByAuthUser?.data ?? null;
  const canonicalProfileId = profile?.id ?? options?.profileId ?? userId;
  const { data: memberships } = await supabase
    .from("fleet_members")
    .select("fleet_id, shop_id, role, created_at")
    .eq("user_id", canonicalProfileId)
    .order("created_at", { ascending: true });

  const typedProfile = (profile ?? null) as Pick<
    ProfileRow,
    "id" | "role" | "shop_id"
  > | null;

  const typedMemberships = (memberships ?? []) as Pick<
    FleetMemberRow,
    "fleet_id" | "shop_id" | "role"
  >[];

  const [shopEntitlement, ...fleetEntitlements] = await Promise.all([
    typedProfile?.shop_id
      ? supabase.rpc("profixiq_shop_has_product_access", {
          p_capability: "fleet_maintenance",
          p_shop_id: typedProfile.shop_id,
        })
      : Promise.resolve({ data: false, error: null }),
    ...typedMemberships.map((membership) =>
      supabase.rpc("profixiq_fleet_has_product_access", {
        p_fleet_id: membership.fleet_id,
      }),
    ),
  ]);

  const entitledMemberships = typedMemberships.filter(
    (_membership, index) => fleetEntitlements[index]?.data === true,
  );
  const shopHasFleetProduct =
    !shopEntitlement.error && shopEntitlement.data === true;

  const requestedFleetId = options?.requestedFleetId ?? null;
  const membershipFleetIds = uniqueStrings(
    entitledMemberships.map((m) => m.fleet_id),
  );

  const membershipRow = requestedFleetId
    ? (entitledMemberships.find((m) => m.fleet_id === requestedFleetId) ?? null)
    : (entitledMemberships[0] ?? null);

  const membershipRole =
    membershipRow?.role ?? entitledMemberships[0]?.role ?? null;
  const membershipShopId =
    membershipRow?.shop_id ?? entitledMemberships[0]?.shop_id ?? null;

  const profileRole = typedProfile?.role ?? null;
  const canonicalRole = canonicalizeRole(profileRole);
  const internalRole = INTERNAL_STAFF_ROLES.includes(canonicalRole);
  const fleetTier = resolveFleetRoleTier(membershipRole);
  const normalizedMembershipRole = String(membershipRole ?? "")
    .trim()
    .toLowerCase();
  const isDispatcherMembership = ["dispatcher", "approver"].includes(
    normalizedMembershipRole,
  );
  // A dual-role user can enter the fleet portal only when they have an explicit fleet membership.
  const hasFleetPortalMembership = fleetTier !== "none";
  const hasFleetProductAccess =
    hasFleetPortalMembership && (!internalRole || shopHasFleetProduct);

  const actorType: FleetActorType = internalRole
    ? "internal_staff"
    : fleetTier === "manager"
      ? "fleet_manager"
      : isDispatcherMembership
        ? "fleet_dispatcher"
        : fleetTier === "viewer"
          ? "fleet_driver"
          : "none";

  const isInternal = actorType === "internal_staff";
  const isFleetActor =
    actorType === "fleet_manager" ||
    actorType === "fleet_dispatcher" ||
    actorType === "fleet_driver";
  const canManageInternalFleet = ["owner", "admin", "manager"].includes(
    canonicalRole,
  );

  const actorCaps = getActorCapabilities({
    role: profileRole,
    fleetRole: membershipRole,
  });

  return {
    userId,
    actorType,
    canonicalRole,
    profileRole,
    profileShopId: typedProfile?.shop_id ?? null,
    shopId: isInternal
      ? (typedProfile?.shop_id ?? membershipShopId ?? null)
      : (membershipShopId ?? typedProfile?.shop_id ?? null),
    fleetIds: membershipFleetIds,
    fleetMemberships: entitledMemberships.map((membership) => ({
      fleetId: membership.fleet_id,
      shopId: membership.shop_id,
      role: membership.role,
    })),
    primaryFleetId:
      membershipRow?.fleet_id ?? entitledMemberships[0]?.fleet_id ?? null,
    membershipRole,
    isInternal,
    isFleetActor,
    capabilities: {
      canSeeFleetWideUnits:
        hasFleetProductAccess &&
        (isInternal ||
          actorType === "fleet_manager" ||
          actorType === "fleet_dispatcher"),
      canCreatePretripReports:
        hasFleetProductAccess && (isInternal || actorType === "fleet_driver"),
      canConvertPretripToServiceRequest:
        hasFleetProductAccess &&
        (isInternal ||
          actorType === "fleet_manager" ||
          actorType === "fleet_dispatcher"),
      canAccessFleetIntake:
        hasFleetProductAccess && (isInternal || isFleetActor),
      canAccessPortalFleetWrappers:
        hasFleetProductAccess && hasFleetPortalMembership,
      canRunFleetDispatchActions:
        hasFleetProductAccess &&
        (canManageInternalFleet || actorCaps.canManageFleetApprovals),
      canOverrideShopScope: false,
    },
  };
}

export function fleetRoleForActor(
  actor: FleetActorContext,
  fleetId: string,
): string | null {
  return (
    actor.fleetMemberships.find((membership) => membership.fleetId === fleetId)
      ?.role ?? null
  );
}

export function canManageFleetForActor(
  actor: FleetActorContext,
  fleetId: string,
): boolean {
  if (actor.isInternal) {
    return ["owner", "admin", "manager"].includes(actor.canonicalRole);
  }
  const tier = resolveFleetRoleTier(fleetRoleForActor(actor, fleetId));
  return tier === "manager" || tier === "approver";
}

export function canAdministerFleetForActor(
  actor: FleetActorContext,
  fleetId: string,
): boolean {
  if (actor.isInternal) {
    return (
      ["owner", "admin", "manager"].includes(actor.canonicalRole) &&
      actor.fleetIds.includes(fleetId)
    );
  }
  return resolveFleetRoleTier(fleetRoleForActor(actor, fleetId)) === "manager";
}

export function manageableFleetIdsForActor(actor: FleetActorContext): string[] {
  if (actor.isInternal) return [];
  return uniqueStrings(
    actor.fleetMemberships
      .filter((membership) => {
        const tier = resolveFleetRoleTier(membership.role);
        return tier === "manager" || tier === "approver";
      })
      .map((membership) => membership.fleetId),
  );
}

export function partitionFleetIdsByManagement(
  actor: FleetActorContext,
  fleetIds: string[],
): { managerFleetIds: string[]; driverFleetIds: string[] } {
  const managerFleetIds = fleetIds.filter((fleetId) =>
    canManageFleetForActor(actor, fleetId),
  );
  const managerFleetIdSet = new Set(managerFleetIds);
  return {
    managerFleetIds,
    driverFleetIds: fleetIds.filter(
      (fleetId) => !managerFleetIdSet.has(fleetId),
    ),
  };
}

export type FleetActorScope = {
  shopId: string;
  fleetIds: string[] | null;
  fleetId: string | null;
};

type ResolveFleetActorScopeInput = {
  explicitShopId?: string | null;
  explicitFleetId?: string | null;
  preferMembershipFleet?: boolean;
};

export function resolveFleetActorScope(
  actor: FleetActorContext,
  input?: ResolveFleetActorScopeInput,
): FleetActorScope | null {
  const explicitShopId = input?.explicitShopId ?? null;
  const explicitFleetId = input?.explicitFleetId ?? null;

  if (actor.actorType === "none" || !actor.shopId) return null;

  if (actor.isInternal) {
    const scopedShopId = explicitShopId
      ? explicitShopId === actor.shopId
        ? actor.shopId
        : null
      : actor.shopId;

    if (!scopedShopId) return null;

    const membershipFleetId =
      input?.preferMembershipFleet && actor.primaryFleetId
        ? actor.primaryFleetId
        : null;
    const scopedFleetId = explicitFleetId ?? membershipFleetId;

    return {
      shopId: scopedShopId,
      fleetId: scopedFleetId,
      fleetIds: scopedFleetId ? [scopedFleetId] : null,
    };
  }

  const explicitMembership = explicitFleetId
    ? (actor.fleetMemberships.find(
        (membership) => membership.fleetId === explicitFleetId,
      ) ?? null)
    : null;
  if (explicitFleetId && !explicitMembership) return null;

  const scopedShopId = explicitMembership?.shopId ?? actor.shopId;
  if (!scopedShopId || (explicitShopId && explicitShopId !== scopedShopId)) {
    return null;
  }

  const scopedFleetIds = explicitFleetId
    ? [explicitFleetId]
    : uniqueStrings(
        actor.fleetMemberships
          .filter(
            (membership) =>
              !membership.shopId || membership.shopId === scopedShopId,
          )
          .map((membership) => membership.fleetId),
      );

  if (!scopedFleetIds || scopedFleetIds.length === 0) return null;

  return {
    shopId: scopedShopId,
    fleetId: scopedFleetIds[0] ?? null,
    fleetIds: scopedFleetIds,
  };
}
