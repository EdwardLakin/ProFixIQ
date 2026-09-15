import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { MatchedMenuItem } from "./appointmentPreparation/buildAppointmentPreparations";
import {
  resolveAppointmentWorkOrderStagingCandidate,
  finalizeAppointmentWorkOrderStaging,
  clearAppointmentWorkOrderStaging,
} from "./appointmentWorkOrderStaging/stageAppointmentWorkOrderLines";

const PAGE_SIZE = 500;

export type SyncAppointmentWorkOrderStagingSummary = {
  shopId: string;
  evaluated: number;
  eligible: number;
  executed: number;
  cleared: number;
  errors: string[];
};

type PreparationRow = {
  booking_id: string;
  status: string | null;
  matched_menu_items: unknown;
};

async function loadActivePreparations(input: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
}): Promise<{ rows: PreparationRow[]; error: string | null }> {
  const rows: PreparationRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await input.supabase
      .from("appointment_preparations")
      .select("booking_id, status, matched_menu_items")
      .eq("shop_id", input.shopId)
      .eq("status", "active")
      .order("booking_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { rows: [], error: error.message };

    const page = (data ?? []) as PreparationRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

async function loadExistingStagedBookingIds(input: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
}): Promise<{ bookingIds: string[]; error: string | null }> {
  const bookingIds: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await input.supabase
      .from("appointment_work_order_staging")
      .select("booking_id")
      .eq("shop_id", input.shopId)
      .order("booking_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { bookingIds: [], error: error.message };

    const page = data ?? [];
    bookingIds.push(...page.map((row) => row.booking_id));
    if (page.length < PAGE_SIZE) break;
  }
  return { bookingIds, error: null };
}

/**
 * Sweep a shop's active appointment_preparations (Phase 4's already-
 * computed projection — no additional matching logic here) for Phase 6's
 * stage_appointment_work_order_lines GREEN command, then clear any
 * previously staged proposal that is no longer eligible this run
 * (converted, cancelled, or no longer parts-ready). This table is a live
 * "current proposal" cache, not a durable history — appointment_work_order_staging's
 * only source of truth is this sweep re-evaluating from scratch each time.
 */
export async function syncAppointmentWorkOrderStaging(input: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
}): Promise<SyncAppointmentWorkOrderStagingSummary> {
  const { supabase, shopId } = input;
  const errors: string[] = [];

  const { rows, error: preparationsError } = await loadActivePreparations({
    supabase,
    shopId,
  });
  if (preparationsError) {
    return {
      shopId,
      evaluated: 0,
      eligible: 0,
      executed: 0,
      cleared: 0,
      errors: [preparationsError],
    };
  }

  let eligible = 0;
  let executed = 0;
  const eligibleBookingIds = new Set<string>();

  for (const row of rows) {
    try {
      const matchedMenuItems = (row.matched_menu_items ?? []) as MatchedMenuItem[];
      const resolved = resolveAppointmentWorkOrderStagingCandidate({
        bookingId: row.booking_id,
        shopId,
        preparationStatus: row.status,
        matchedMenuItems,
      });
      if (!resolved.eligible) continue;

      eligible += 1;
      eligibleBookingIds.add(row.booking_id);

      const result = await finalizeAppointmentWorkOrderStaging({
        admin: supabase,
        candidate: resolved.candidate,
      });
      if (result.executed) executed += 1;
    } catch (error) {
      errors.push(
        `booking ${row.booking_id}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  let cleared = 0;
  const { bookingIds: existingStagedBookingIds, error: existingStagedError } =
    await loadExistingStagedBookingIds({ supabase, shopId });
  if (existingStagedError) {
    errors.push(existingStagedError);
  } else {
    const staleBookingIds = existingStagedBookingIds.filter(
      (bookingId) => !eligibleBookingIds.has(bookingId),
    );
    if (staleBookingIds.length > 0) {
      try {
        await clearAppointmentWorkOrderStaging({
          admin: supabase,
          shopId,
          bookingIds: staleBookingIds,
        });
        cleared = staleBookingIds.length;
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : "Could not clear stale staged appointment work order lines",
        );
      }
    }
  }

  return { shopId, evaluated: rows.length, eligible, executed, cleared, errors };
}
