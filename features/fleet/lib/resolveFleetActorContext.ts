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
  | "fleet_driver"
  | "none";

export type FleetActorCapabilities = {
  canSeeFleetWideUnits: boolean;
  canCreatePretripReports: boolean;
  canConvertPretripToServiceRequest: boolean;
  canConvertServiceRequestToWorkOrder: boolean;
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
        canConvertServiceRequestToWorkOrder: false,
        canAccessFleetIntake: false,
        canAccessPortalFleetWrappers: false,
        canRunFleetDispatchActions: false,
        canOverrideShopScope: false,
      },
    };
  }

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, role, shop_id")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("fleet_members")
      .select("fleet_id, shop_id, role, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  const typedProfile = (profile ?? null) as Pick<
    ProfileRow,
    "id" | "role" | "shop_id"
  > | null;

  const typedMemberships = (memberships ?? []) as Pick<
    FleetMemberRow,
    "fleet_id" | "shop_id" | "role"
  >[];

  const requestedFleetId = options?.requestedFleetId ?? null;
  const membershipFleetIds = uniqueStrings(
    typedMemberships.map((m) => m.fleet_id),
  );

  const membershipRow = requestedFleetId
    ? (typedMemberships.find((m) => m.fleet_id === requestedFleetId) ?? null)
    : (typedMemberships[0] ?? null);

  const membershipRole =
    membershipRow?.role ?? typedMemberships[0]?.role ?? null;
  const membershipShopId =
    membershipRow?.shop_id ?? typedMemberships[0]?.shop_id ?? null;

  const profileRole = typedProfile?.role ?? null;
  const canonicalRole = canonicalizeRole(profileRole);
  const internalRole = INTERNAL_STAFF_ROLES.includes(canonicalRole);
  const fleetTier = resolveFleetRoleTier(membershipRole);
  // A dual-role user can enter the fleet portal only when they have an explicit fleet membership.
  const hasFleetPortalMembership = fleetTier !== "none";

  const actorType: FleetActorType = internalRole
    ? "internal_staff"
    : fleetTier === "manager" || fleetTier === "approver"
      ? "fleet_manager"
      : fleetTier === "viewer"
        ? "fleet_driver"
        : "none";

  const isInternal = actorType === "internal_staff";
  const isFleetActor =
    actorType === "fleet_manager" || actorType === "fleet_driver";
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
    shopId: typedProfile?.shop_id ?? membershipShopId ?? null,
    fleetIds: membershipFleetIds,
    fleetMemberships: typedMemberships.map((membership) => ({
      fleetId: membership.fleet_id,
      shopId: membership.shop_id,
      role: membership.role,
    })),
    primaryFleetId:
      membershipRow?.fleet_id ?? typedMemberships[0]?.fleet_id ?? null,
    membershipRole,
    isInternal,
    isFleetActor,
    capabilities: {
      canSeeFleetWideUnits: isInternal || actorType === "fleet_manager",
      canCreatePretripReports: isInternal || isFleetActor,
      canConvertPretripToServiceRequest:
        isInternal || actorType === "fleet_manager",
      canConvertServiceRequestToWorkOrder: isInternal,
      canAccessFleetIntake: isInternal || isFleetActor,
      canAccessPortalFleetWrappers: hasFleetPortalMembership,
      canRunFleetDispatchActions:
        canManageInternalFleet || actorCaps.canManageFleetApprovals,
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

  if (explicitShopId && explicitShopId !== actor.shopId) return null;

  const scopedFleetIds = explicitFleetId
    ? actor.fleetIds.includes(explicitFleetId)
      ? [explicitFleetId]
      : null
    : actor.fleetIds;

  if (!scopedFleetIds || scopedFleetIds.length === 0) return null;

  return {
    shopId: actor.shopId,
    fleetId: scopedFleetIds[0] ?? null,
    fleetIds: scopedFleetIds,
  };
}
