import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { resolveCanonicalStaffProfile } from "@/features/shared/lib/authenticated-profile";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  canFieldOperatorAccessWorkOrder,
  type ShopAccess,
} from "@/features/mobile/service/server/access";
import {
  resolveShopProductAccess,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";

type DB = Database;

export type WorkOrderEvidenceActor = {
  userId: string;
  kind: "staff" | "customer" | "fleet";
  shopId: string;
  workOrderId: string;
  vehicleId: string | null;
  canEdit: boolean;
};

export async function authorizeWorkOrderEvidence(
  sessionClient: SupabaseClient<DB>,
  workOrderId: string,
): Promise<WorkOrderEvidenceActor | null> {
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return null;

  const admin = createAdminSupabase();
  const { data: workOrder } = await admin
    .from("work_orders")
    .select("id,shop_id,customer_id,vehicle_id")
    .eq("id", workOrderId)
    .maybeSingle();
  if (!workOrder?.id || !workOrder.shop_id) return null;

  const profilePromise = resolveCanonicalStaffProfile(admin, user.id);
  const portalAccessPromise = workOrder.customer_id
    ? sessionClient.rpc("profixiq_is_portal_customer_for", {
        p_customer_id: workOrder.customer_id,
        p_shop_id: workOrder.shop_id,
      })
    : Promise.resolve({ data: false, error: null });
  const [{ profile }, { data: portalAccess, error: portalAccessError }] =
    await Promise.all([profilePromise, portalAccessPromise]);

  const capabilities = getActorCapabilities({ role: profile?.role });
  const isStaffIdentity =
    profile?.shop_id === workOrder.shop_id &&
    capabilities.isKnownRole &&
    capabilities.canonicalRole !== "customer" &&
    !capabilities.canViewFleetOnlyData;

  if (isStaffIdentity && profile?.shop_id) {
    const shopProduct = await resolveShopProductAccess({
      supabase: sessionClient,
      shopId: profile.shop_id,
      capabilities: SHOP_PRODUCT_CAPABILITIES,
    });
    let fieldRelationship = false;
    if (!shopProduct.entitled) {
      try {
        const fieldAccess: ShopAccess = {
          ok: true,
          profile: { ...profile, shop_id: profile.shop_id },
          canonicalRole: capabilities.canonicalRole,
          authUserId: user.id,
          supabase: sessionClient as ShopAccess["supabase"],
        };
        fieldRelationship = await canFieldOperatorAccessWorkOrder(
          fieldAccess,
          workOrder.id,
        );
      } catch {
        // Field is one independent relationship path. A failed Field lookup
        // must not suppress a separately verifiable Fleet relationship below.
        fieldRelationship = false;
      }
    }
    if (shopProduct.entitled || fieldRelationship) {
      return {
        userId: user.id,
        kind: "staff",
        shopId: workOrder.shop_id,
        workOrderId: workOrder.id,
        vehicleId: workOrder.vehicle_id,
        canEdit:
          capabilities.canManageWorkOrders || capabilities.canRunInspections,
      };
    }
  }

  if (!portalAccessError && portalAccess === true) {
    return {
      userId: user.id,
      kind: "customer",
      shopId: workOrder.shop_id,
      workOrderId: workOrder.id,
      vehicleId: workOrder.vehicle_id,
      canEdit: false,
    };
  }

  if (!workOrder.vehicle_id) return null;

  let fleetActor;
  try {
    fleetActor = await resolveFleetActorContext(sessionClient, {
      userId: user.id,
      profileId: profile?.id,
    });
  } catch {
    return null;
  }
  if (!fleetActor.capabilities.canAccessPortalFleetWrappers) return null;

  const fleetIds = fleetActor.fleetMemberships
    .filter((membership) => membership.shopId === workOrder.shop_id)
    .map((membership) => membership.fleetId);
  if (fleetIds.length === 0) return null;

  const { data: fleetVehicle } = await admin
    .from("fleet_vehicles")
    .select("id")
    .eq("vehicle_id", workOrder.vehicle_id)
    .in("fleet_id", fleetIds)
    .limit(1)
    .maybeSingle();
  if (!fleetVehicle?.id) return null;

  return {
    userId: user.id,
    kind: "fleet",
    shopId: workOrder.shop_id,
    workOrderId: workOrder.id,
    vehicleId: workOrder.vehicle_id,
    canEdit: false,
  };
}
