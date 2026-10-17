import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { customerAccountDisplayName } from "@/features/vehicles/lib/vehicleWorkspace";

/** Resolve missing snapshots from the WO's account, never the asset's current owner. */
export async function loadEquipmentWorkCustomerNames(
  admin: SupabaseClient<Database>,
  shopId: string,
  records: readonly {
    customer_id: string | null;
    customer_name: string | null;
  }[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      records.flatMap((row) =>
        !row.customer_name?.trim() && row.customer_id ? [row.customer_id] : [],
      ),
    ),
  ];
  const names = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await admin
      .from("customers")
      .select("id,business_name,name,first_name,last_name")
      .eq("shop_id", shopId)
      .in("id", ids.slice(offset, offset + 100));
    if (error) throw new Error("Unable to load Equipment work customers.");
    for (const row of data ?? [])
      names.set(row.id, customerAccountDisplayName(row));
  }
  return names;
}
