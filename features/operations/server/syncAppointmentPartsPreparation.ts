import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { loadRowsForIdChunks } from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import type { Database } from "@shared/types/types/supabase";
import { prepareAppointmentPartsRequest } from "./appointmentPartsPreparation/prepareAppointmentPartsRequest";

type DB = Database;
type CandidateLine = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  "id" | "work_order_id" | "menu_item_id" | "voided_at"
>;

// A work order that started too long ago is unlikely to still be missing a
// parts request for a reason this command should touch (the job is likely
// already finished or handled some other way); bounding the sweep by how
// recently its booking started keeps this a live, narrow automation instead
// of an unbounded historical scan.
const BOOKING_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const BOOKING_PAGE_SIZE = 500;

export type SyncAppointmentPartsPreparationSummary = {
  shopId: string;
  evaluated: number;
  eligible: number;
  executed: number;
  errors: string[];
};

async function loadCandidateWorkOrderIds(input: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  since: Date;
}): Promise<{ workOrderIds: string[]; error: string | null }> {
  const workOrderIds: string[] = [];
  for (let from = 0; ; from += BOOKING_PAGE_SIZE) {
    const { data, error } = await input.supabase
      .from("bookings")
      .select("work_order_id")
      .eq("shop_id", input.shopId)
      .not("work_order_id", "is", null)
      .is("cancelled_at", null)
      .gte("starts_at", input.since.toISOString())
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + BOOKING_PAGE_SIZE - 1);

    if (error) return { workOrderIds: [], error: error.message };

    const page = data ?? [];
    for (const row of page) {
      if (row.work_order_id) workOrderIds.push(row.work_order_id);
    }
    if (page.length < BOOKING_PAGE_SIZE) break;
  }

  return { workOrderIds: [...new Set(workOrderIds)], error: null };
}

/**
 * Sweep a shop's booking-linked work orders for lines eligible for Phase
 * 5's deterministic GREEN parts-request command, and evaluate each one.
 * This never guesses which lines need parts — it only evaluates lines that
 * already carry an explicit menu-repair-item mapping
 * (work_order_lines.menu_item_id).
 */
export async function syncAppointmentPartsPreparation(input: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  now?: Date;
}): Promise<SyncAppointmentPartsPreparationSummary> {
  const { supabase, shopId } = input;
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - BOOKING_LOOKBACK_MS);

  const { workOrderIds, error: bookingsError } = await loadCandidateWorkOrderIds({
    supabase,
    shopId,
    since,
  });
  if (bookingsError) {
    return { shopId, evaluated: 0, eligible: 0, executed: 0, errors: [bookingsError] };
  }
  if (workOrderIds.length === 0) {
    return { shopId, evaluated: 0, eligible: 0, executed: 0, errors: [] };
  }

  let lines: CandidateLine[];
  try {
    lines = await loadRowsForIdChunks<CandidateLine>(workOrderIds, (ids, from, to) =>
      supabase
        .from("work_order_lines")
        .select("id, work_order_id, menu_item_id, voided_at")
        .eq("shop_id", shopId)
        .in("work_order_id", ids)
        .not("menu_item_id", "is", null)
        .is("voided_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch (error) {
    return {
      shopId,
      evaluated: 0,
      eligible: 0,
      executed: 0,
      errors: [error instanceof Error ? error.message : "Failed to load candidate lines"],
    };
  }

  let eligible = 0;
  let executed = 0;
  const errors: string[] = [];

  for (const line of lines) {
    try {
      const result = await prepareAppointmentPartsRequest({
        admin: supabase,
        shopId,
        workOrderLineId: line.id,
      });
      if (result.eligible) {
        eligible += 1;
        if (result.executed) executed += 1;
      }
    } catch (error) {
      errors.push(
        `work order line ${line.id}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  return { shopId, evaluated: lines.length, eligible, executed, errors };
}
