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
      alerts: [],
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

  const summaryRecords = new Map<string, FieldTruckRecord>();
  const collectAll = async (
    loadPage: (from: number, to: number) => PromiseLike<{
      data: unknown[] | null;
      error: { message: string } | null;
    }>,
  ) => {
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data: page, error: pageError } = await loadPage(
        from,
        from + pageSize - 1,
      );
      if (pageError) throw new Error(pageError.message);
      for (const record of (page ?? []) as FieldTruckRecord[]) {
        summaryRecords.set(record.id, record);
      }
      if ((page ?? []).length < pageSize) break;
    }
  };

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const nextMonth = new Date(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const [latestResult] = await Promise.all([
    input.supabase
      .from("field_truck_records")
      .select(FIELD_TRUCK_RECORD_SELECT)
      .eq("shop_id", input.shopId)
      .eq("service_vehicle_id", truck.id)
      .in("record_type", ["odometer", "maintenance"])
      .not("odometer", "is", null)
      .order("occurred_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1),
    collectAll((from, to) =>
      input.supabase
        .from("field_truck_records")
        .select(FIELD_TRUCK_RECORD_SELECT)
        .eq("shop_id", input.shopId)
        .eq("service_vehicle_id", truck.id)
        .in("record_type", ["reminder", "downtime"])
        .eq("status", "open")
        .range(from, to),
    ),
    collectAll((from, to) =>
      input.supabase
        .from("field_truck_records")
        .select(FIELD_TRUCK_RECORD_SELECT)
        .eq("shop_id", input.shopId)
        .eq("service_vehicle_id", truck.id)
        .in("record_type", ["expense", "maintenance"])
        .gte("occurred_on", monthStart.toISOString().slice(0, 10))
        .lt("occurred_on", nextMonth.toISOString().slice(0, 10))
        .range(from, to),
    ),
  ]);
  if (latestResult.error) throw new Error(latestResult.error.message);
  for (const record of (latestResult.data ?? []) as FieldTruckRecord[]) {
    summaryRecords.set(record.id, record);
  }

  return {
    truck: {
      id: truck.id,
      name: truck.name,
      unitNumber: truck.unit_number,
    },
    records,
    alerts: [...summaryRecords.values()]
      .filter(
        (record) =>
          record.status === "open" &&
          ["reminder", "downtime"].includes(record.record_type),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    summary: buildFieldMyTruckSummary([...summaryRecords.values()]),
  };
}

export { FIELD_TRUCK_RECORD_SELECT };
