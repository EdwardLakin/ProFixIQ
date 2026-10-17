import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

/** Only the authenticated actor's pending participant receipts. The caller has
 * checked Equipment entitlement and canonical Field access. No customer, asset,
 * work-order detail or execution capability is granted to support participants. */
export async function loadPersonalEquipmentAcknowledgements(input: {
  admin: SupabaseClient<Database>;
  shopId: string;
  actorId: string;
}) {
  const rows: Array<{ visitId: string; role: string; addedAt: string }> = [];
  let partial = false;
  for (let offset = 0; ; offset += 100) {
    const participants = await input.admin
      .from("service_visit_participants")
      .select("service_visit_id,role,added_at")
      .eq("shop_id", input.shopId)
      .eq("user_id", input.actorId)
      .is("removed_at", null)
      .is("acknowledged_at", null)
      .order("id")
      .range(offset, offset + 99);
    if (participants.error)
      throw new Error("Unable to load your acknowledgements.");
    const batch = participants.data ?? [];
    if (!batch.length) break;
    const visits = await input.admin
      .from("service_visits")
      .select("id,work_order_id")
      .eq("shop_id", input.shopId)
      .eq("mode", "mobile")
      .in(
        "id",
        batch.map((p) => p.service_visit_id),
      )
      .in("status", [
        "scheduled",
        "dispatched",
        "en_route",
        "arrived",
        "working",
        "paused",
      ]);
    if (visits.error) throw new Error("Unable to load your visits.");
    const workIds = [
      ...new Set(
        (visits.data ?? []).flatMap((v) =>
          v.work_order_id ? [v.work_order_id] : [],
        ),
      ),
    ];
    if (workIds.length) {
      const work = await input.admin
        .from("work_orders")
        .select("id,vehicle_id")
        .eq("shop_id", input.shopId)
        .in("id", workIds);
      if (work.error)
        throw new Error("Unable to verify Equipment assignments.");
      const assetIds = [
        ...new Set(
          (work.data ?? []).flatMap((w) =>
            w.vehicle_id ? [w.vehicle_id] : [],
          ),
        ),
      ];
      if (assetIds.length) {
        const profiles = await input.admin
          .from("equipment_asset_profiles")
          .select("vehicle_id")
          .eq("shop_id", input.shopId)
          .in("vehicle_id", assetIds);
        if (profiles.error)
          throw new Error("Unable to verify Equipment assignments.");
        const equipment = new Set(
          (profiles.data ?? []).map((p) => p.vehicle_id),
        );
        const equipmentWork = new Set(
          (work.data ?? [])
            .filter((w) => w.vehicle_id && equipment.has(w.vehicle_id))
            .map((w) => w.id),
        );
        const allowed = new Set(
          (visits.data ?? [])
            .filter(
              (v) => v.work_order_id && equipmentWork.has(v.work_order_id),
            )
            .map((v) => v.id),
        );
        rows.push(
          ...batch
            .filter((p) => allowed.has(p.service_visit_id))
            .map((p) => ({
              visitId: p.service_visit_id,
              role: p.role,
              addedAt: p.added_at,
            })),
        );
      }
    }
    if (batch.length < 100) break;
    if (offset + 100 >= 5000) {
      partial = true;
      break;
    }
  }
  return { rows, partial };
}
