import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

import {
  buildFieldMyTruckSummary,
  type FieldMyTruckSnapshot,
  type FieldTruckRecord,
} from "@/features/mobile/service/myTruck";

type Client = SupabaseClient<Database>;

const FIELD_TRUCK_RECORD_SELECT =
  "id,shop_id,service_vehicle_id,operation_key,record_type,title,occurred_on,odometer,odometer_unit,amount,currency,vendor,due_on,due_odometer,starts_at,ends_at,status,notes,file_bucket,file_path,original_filename,content_type,file_size_bytes,created_by_profile_id,created_at,updated_at";

export async function resolveAssignedFieldTruck(input: {
  supabase: Client;
  shopId: string;
  profileId: string;
}) {
  const { data, error } = await input.supabase
    .from("service_vehicles")
    .select("id,name,unit_number")
    .eq("shop_id", input.shopId)
    .eq("primary_user_id", input.profileId)
    .eq("active", true)
    .contains("capabilities", { mobile_v1: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; name: string; unit_number: string | null }>();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function loadFieldMyTruckSnapshot(input: {
  supabase: Client;
  shopId: string;
  profileId: string;
}): Promise<FieldMyTruckSnapshot> {
  const truck = await resolveAssignedFieldTruck(input);
  if (!truck) {
    return {
      truck: null,
      records: [],
      summary: buildFieldMyTruckSummary([]),
    };
  }

  const { data, error } = await input.supabase
    .from("field_truck_records")
    .select(FIELD_TRUCK_RECORD_SELECT)
    .eq("shop_id", input.shopId)
    .eq("service_vehicle_id", truck.id)
    .order("created_at", { ascending: false })
    .limit(250);
  if (error) throw new Error(error.message);
  const records = (data ?? []) as FieldTruckRecord[];

  return {
    truck: {
      id: truck.id,
      name: truck.name,
      unitNumber: truck.unit_number,
    },
    records,
    summary: buildFieldMyTruckSummary(records),
  };
}

export { FIELD_TRUCK_RECORD_SELECT };
