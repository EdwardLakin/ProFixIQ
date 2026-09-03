import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { getMobileFieldServiceAccess } from "@/features/mobile/service/server/access";
import type { AuthenticatedStaffProfile } from "@/features/shared/lib/authenticated-profile";
import {
  getActorCapabilities,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";
import {
  resolveShopProductAccess,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";

type DB = Database;

const ACTIVE_FIELD_VISIT_STATUSES = [
  "scheduled",
  "dispatched",
  "en_route",
  "arrived",
  "working",
  "paused",
] as const;

type WorkOrderCommandActor = {
  authUserId: string;
  canonicalRole: CanonicalRole;
  profile: Omit<AuthenticatedStaffProfile, "shop_id"> & { shop_id: string };
  supabase: SupabaseClient<DB>;
};

export type WorkOrderCommandProductAccess =
  | { authorized: true; product: "shop" | "field"; error: null }
  | { authorized: false; product: null; error: string | null };

/**
 * Authorize one fresh public Work Order command without broadening Field into
 * tenant-wide Shop access. Shop retains its role-shaped command behavior.
 * Field requires an existing mobile Service Visit that is either managed by
 * the caller or explicitly assigned to the caller.
 */
export async function resolveWorkOrderCommandProductAccess(input: {
  access: WorkOrderCommandActor;
  workOrderId: string;
}): Promise<WorkOrderCommandProductAccess> {
  const actor = getActorCapabilities({ role: input.access.profile.role });
  if (
    !actor.isKnownRole ||
    actor.canonicalRole === "customer" ||
    actor.canViewFleetOnlyData
  ) {
    return { authorized: false, product: null, error: null };
  }

  let shopAccess;
  try {
    shopAccess = await resolveShopProductAccess({
      supabase: input.access.supabase,
      shopId: input.access.profile.shop_id,
      capabilities: SHOP_PRODUCT_CAPABILITIES,
    });
  } catch {
    return {
      authorized: false,
      product: null,
      error: "Unable to verify Shop product access.",
    };
  }
  if (shopAccess.entitled) {
    return { authorized: true, product: "shop", error: null };
  }

  let fieldAccess;
  try {
    fieldAccess = await getMobileFieldServiceAccess({
      ...input.access,
      ok: true,
    });
  } catch {
    return {
      authorized: false,
      product: null,
      error: "Unable to verify Field Service access.",
    };
  }

  const canManageLinkedFieldWork =
    fieldAccess.standaloneFieldWorkspace || actor.canManageScheduling;
  if (
    !fieldAccess.canAccessFieldService ||
    (!canManageLinkedFieldWork && !actor.canPerformAssignedWork)
  ) {
    return {
      authorized: false,
      product: null,
      error: shopAccess.error,
    };
  }

  let visitQuery = input.access.supabase
    .from("service_visits")
    .select("id")
    .eq("shop_id", input.access.profile.shop_id)
    .eq("work_order_id", input.workOrderId)
    .eq("mode", "mobile")
    .in("status", ACTIVE_FIELD_VISIT_STATUSES);
  if (!canManageLinkedFieldWork) {
    visitQuery = visitQuery.eq("assigned_user_id", input.access.profile.id);
  }

  const { data: visit, error: visitError } = await visitQuery
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (visitError) {
    return { authorized: false, product: null, error: visitError.message };
  }
  if (visit?.id) {
    return { authorized: true, product: "field", error: null };
  }

  return {
    authorized: false,
    product: null,
    error: shopAccess.error,
  };
}
