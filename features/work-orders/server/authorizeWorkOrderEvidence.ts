import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

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

  const profilePromise = admin
    .from("profiles")
    .select("id,shop_id,role")
    .eq("id", user.id)
    .maybeSingle();
  const customerPromise = workOrder.customer_id
    ? admin
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .eq("id", workOrder.customer_id)
        .eq("shop_id", workOrder.shop_id)
        .maybeSingle()
    : Promise.resolve({ data: null });
  const [{ data: profile }, { data: customer }] = await Promise.all([
    profilePromise,
    customerPromise,
  ]);

  const capabilities = getActorCapabilities({ role: profile?.role });
  const isShopStaff =
    profile?.shop_id === workOrder.shop_id &&
    capabilities.isKnownRole &&
    capabilities.canonicalRole !== "customer" &&
    !capabilities.canViewFleetOnlyData;

  if (isShopStaff) {
    return {
      userId: user.id,
      kind: "staff",
      shopId: workOrder.shop_id,
      workOrderId: workOrder.id,
      vehicleId: workOrder.vehicle_id,
      canEdit:
        capabilities.canManageWorkOrders ||
        capabilities.canRunInspections,
    };
  }

  if (customer?.id && customer.id === workOrder.customer_id) {
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

  const { data: membership } = await admin
    .from("fleet_members")
    .select("fleet_id")
    .eq("user_id", user.id)
    .eq("shop_id", workOrder.shop_id);
  const fleetIds = (membership ?? []).map((row) => row.fleet_id);
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
