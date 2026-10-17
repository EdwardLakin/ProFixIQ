import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { getDispatchBoard } from "@/features/dispatch/server/commands";
import { equipmentDispatchPage } from "@/features/equipment/dispatch/lib/equipmentDispatchBoard";
import { loadEquipmentWorkQueueProjection } from "@/features/equipment/server/loadEquipmentWorkQueue";
import type { EquipmentQueueFilters } from "@/features/equipment/lib/equipmentWorkQueue";
import {
  getActorCapabilities,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";

/** Caller checks session and Equipment entitlement before any privileged reads. */
export async function loadEquipmentDispatch(input: {
  supabase: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  shopId: string;
  actorUserId: string;
  role: CanonicalRole;
  filters: EquipmentQueueFilters;
  workOrderId: string;
  now?: Date;
}) {
  if (!getActorCapabilities({ role: input.role }).canManageScheduling)
    throw new Error("Dispatch access denied.");
  const now = input.now ?? new Date();
  const startsAt = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(
    now.getTime() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const [projection, board] = await Promise.all([
    loadEquipmentWorkQueueProjection({
      ...input,
      filters: { ...input.filters, asset: "" },
    }),
    getDispatchBoard({ ...input, startsAt, endsAt }),
  ]);
  const page = equipmentDispatchPage(
    board,
    input.shopId,
    projection.assets,
    input.filters,
  );
  const work = projection.rows.filter(
    (row) => row.kind === "work_order" && row.active,
  );
  const selected = work.find((row) => row.id === input.workOrderId) ?? null;
  const addresses: Array<{ id: string; label: string }> = [];
  let addressesPartial = false;
  if (selected) {
    const { data: wo, error } = await input.supabase
      .from("work_orders")
      .select("customer_id")
      .eq("shop_id", input.shopId)
      .eq("vehicle_id", selected.assetId)
      .eq("id", selected.id)
      .maybeSingle();
    if (error) throw new Error("Unable to load dispatch work order.");
    if (wo?.customer_id) {
      const result = await input.supabase
        .from("service_addresses")
        .select("id,label,address_line1,city")
        .eq("shop_id", input.shopId)
        .eq("customer_id", wo.customer_id)
        .order("id")
        .limit(101);
      if (result.error) throw new Error("Unable to load jobsites.");
      addressesPartial = (result.data ?? []).length > 100;
      addresses.push(
        ...(result.data ?? []).slice(0, 100).map((row) => ({
          id: row.id,
          label: [row.label, row.address_line1, row.city]
            .filter(Boolean)
            .join(" · "),
        })),
      );
    }
  }
  const participants: Array<{
    service_visit_id: string;
    user_id: string | null;
    role: string;
    acknowledged_at: string | null;
  }> = [];
  if (page.items.length) {
    // Only the Equipment visits on this page; paginate participants too so no
    // API row cap can silently hide a supporting technician.
    for (let offset = 0; ; offset += 500) {
      const result = await input.admin
        .from("service_visit_participants")
        .select("service_visit_id,user_id,role,acknowledged_at")
        .eq("shop_id", input.shopId)
        .in(
          "service_visit_id",
          page.items.map((v) => v.id),
        )
        .is("removed_at", null)
        .order("id")
        .range(offset, offset + 499);
      if (result.error) throw new Error("Unable to load visit participants.");
      participants.push(...(result.data ?? []));
      if ((result.data ?? []).length < 500) break;
    }
  }
  return {
    ...page,
    assets: projection.assets,
    partial: projection.partial,
    work,
    selected,
    addresses,
    addressesPartial,
    participants,
    technicians: board.technicians.filter(
      (tech) =>
        (tech as typeof tech & { fieldOperator?: boolean }).fieldOperator ===
        true,
    ),
    serviceVehicles: board.serviceVehicles,
    generatedAt: board.generatedAt,
    startsAt,
    endsAt,
  };
}
export type EquipmentDispatchData = Awaited<
  ReturnType<typeof loadEquipmentDispatch>
>;
