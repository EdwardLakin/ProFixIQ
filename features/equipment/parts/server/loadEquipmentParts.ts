import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import {
  loadPartsRequestQueue,
  PARTS_REQUEST_QUEUE_ROLES,
} from "@/features/parts/server/loadPartsRequestQueue";
import { buildPartsRequestQueueModels } from "@/features/parts/lib/requests/parts-request-queue";
import { loadRowsForIdChunks } from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import type { EquipmentPartsRow } from "../lib/equipmentParts";

/** Session Parts/work reads; server-only asset identity after page authorization. */
export async function loadEquipmentParts(input: {
  supabase: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  shopId: string;
  role: CanonicalRole;
}): Promise<EquipmentPartsRow[]> {
  if (!PARTS_REQUEST_QUEUE_ROLES.includes(input.role))
    throw new Error("Parts queue access denied.");
  const snapshot = await loadPartsRequestQueue(input);
  const workIds = snapshot.requests
    .filter((r) => r.shop_id === input.shopId)
    .flatMap((r) => (r.work_order_id ? [r.work_order_id] : []));
  const work = await loadRowsForIdChunks<{
    id: string;
    vehicle_id: string | null;
    shop_id: string;
  }>(workIds, (ids, from, to) =>
    input.supabase
      .from("work_orders")
      .select("id,vehicle_id,shop_id")
      .eq("shop_id", input.shopId)
      .in("id", ids)
      .order("id")
      .range(from, to),
  );
  const assets = await loadRowsForIdChunks<{
    vehicle_id: string;
    shop_id: string;
  }>(
    work.flatMap((w) => (w.vehicle_id ? [w.vehicle_id] : [])),
    (ids, from, to) =>
      input.admin
        .from("equipment_asset_profiles")
        .select("vehicle_id,shop_id")
        .eq("shop_id", input.shopId)
        .in("vehicle_id", ids)
        .order("vehicle_id")
        .range(from, to),
  );
  const assetIds = new Set(
    assets.filter((a) => a.shop_id === input.shopId).map((a) => a.vehicle_id),
  );
  const equipmentWork = new Map(
    work
      .filter(
        (w) =>
          w.shop_id === input.shopId &&
          w.vehicle_id &&
          assetIds.has(w.vehicle_id),
      )
      .map((w) => [w.id, w]),
  );
  const identities = new Map(snapshot.workOrders.map((w) => [w.id, w]));
  // Scope BEFORE stage derivation, counts, search and UI pagination. Unlinked,
  // ordinary-product and foreign-tenant requests never reach the client.
  const requests = snapshot.requests.filter(
    (r) =>
      r.shop_id === input.shopId &&
      r.work_order_id &&
      equipmentWork.has(r.work_order_id),
  );
  const requestIds = new Set(requests.map((r) => r.id));
  return buildPartsRequestQueueModels({
    ...snapshot,
    requests,
    items: snapshot.items.filter((i) => requestIds.has(i.request_id)),
  }).map(({ request, items, stage }) => {
    const id = request.work_order_id!;
    const identity = identities.get(id);
    return {
      id: request.id,
      workOrderId: id,
      workOrderLabel:
        identity?.estimate_number ||
        identity?.custom_id ||
        `#${id.slice(0, 8)}`,
      assetId: equipmentWork.get(id)!.vehicle_id!,
      stage,
      createdAt: request.created_at,
      items: items.map((item) => ({
        id: item.id,
        description: item.description,
        requested: item.qty_requested ?? item.qty,
        received: item.qty_received,
        reserved: item.qty_reserved,
      })),
    };
  });
}
