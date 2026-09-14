import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import { buildAppointmentPreparations } from "./appointmentPreparation/buildAppointmentPreparations";

type DB = Database;
type Booking = Pick<
  DB["public"]["Tables"]["bookings"]["Row"],
  "id" | "starts_at" | "status" | "customer_id" | "vehicle_id" | "notes" | "work_order_id"
>;

// Bookings up to a week out are worth preparing ahead of time; further out
// than that the picture is still likely to change (rescheduling, vehicle
// swaps) before it matters.
const PREP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const EXCLUDED_BOOKING_STATUSES = new Set(["cancelled", "canceled", "completed"]);
const BOOKING_PAGE_SIZE = 500;

export type SyncAppointmentPreparationsSummary = {
  shopId: string;
  upcoming: number;
  resolved: number;
  errors: string[];
};

async function loadUpcomingBookings(input: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  now: Date;
  windowEnd: Date;
}): Promise<{ bookings: Booking[]; error: string | null }> {
  const { supabase, shopId, now, windowEnd } = input;
  const bookings: Booking[] = [];

  // A single unpaginated select is silently truncated at the Data API's
  // configured max_rows for a shop with enough bookings in the window - the
  // bookings past that cut would then be missing from activeBookingIds and
  // this run would incorrectly resolve their still-upcoming preparations.
  for (let from = 0; ; from += BOOKING_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, starts_at, status, customer_id, vehicle_id, notes, work_order_id")
      .eq("shop_id", shopId)
      .gte("starts_at", now.toISOString())
      .lt("starts_at", windowEnd.toISOString())
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + BOOKING_PAGE_SIZE - 1);

    if (error) return { bookings: [], error: error.message };

    const page = (data ?? []) as Booking[];
    bookings.push(...page);
    if (page.length < BOOKING_PAGE_SIZE) break;
  }

  return { bookings, error: null };
}

export async function syncAppointmentPreparations(input: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  now?: Date;
}): Promise<SyncAppointmentPreparationsSummary> {
  const { supabase, shopId } = input;
  const now = input.now ?? new Date();
  const windowEnd = new Date(now.getTime() + PREP_WINDOW_MS);

  const { bookings: allBookings, error: bookingsError } = await loadUpcomingBookings({
    supabase,
    shopId,
    now,
    windowEnd,
  });
  if (bookingsError) {
    return { shopId, upcoming: 0, resolved: 0, errors: [bookingsError] };
  }

  const bookings = allBookings.filter((row) => {
    if (EXCLUDED_BOOKING_STATUSES.has(String(row.status ?? "").toLowerCase())) return false;
    // Once a booking has been converted to a work order, the canonical
    // create flow already carries its context forward - keeping it "active"
    // here would send staff back through the create-work-order card and
    // risk a second work order for the same appointment.
    if (row.work_order_id) return false;
    return true;
  });

  const { preparations, failedBookingIds, errors } = await buildAppointmentPreparations({
    admin: supabase,
    shopId,
    bookings,
    canViewPricing: true,
  });

  let resolved = 0;
  const activeBookingIds = preparations.map((p) => p.bookingId);
  // A booking whose data failed to fully assemble this run is neither
  // "still active" (its preparation may now be stale) nor "no longer
  // upcoming" - leave its existing row untouched either way rather than
  // resolving or overwriting it on incomplete information.
  const excludedFromResolve = [...activeBookingIds, ...failedBookingIds];

  // Any previously-active preparation whose booking is no longer upcoming
  // (past, cancelled, converted, or newly outside the lookahead window) is
  // resolved rather than deleted, so the projection stays a durable,
  // auditable record.
  const resolveQuery = supabase
    .from("appointment_preparations")
    .update({ status: "resolved", resolved_at: now.toISOString() })
    .eq("shop_id", shopId)
    .eq("status", "active");
  const { data: resolvedRows, error: resolveError } =
    excludedFromResolve.length > 0
      ? await resolveQuery.not("booking_id", "in", `(${excludedFromResolve.join(",")})`).select("id")
      : await resolveQuery.select("id");

  if (resolveError) {
    errors.push(resolveError.message);
  } else {
    resolved = resolvedRows?.length ?? 0;
  }

  if (preparations.length > 0) {
    // Guard against a slow, stale run clobbering a fresher run's result: if
    // another (newer) run has already touched a target row since this run
    // began, skip re-activating it here rather than blindly overwriting.
    // This narrows, but does not fully close, the race - a fresher write
    // landing in the gap between this check and the upsert below would
    // still be clobbered - full closure needs an atomic conditional upsert,
    // which isn't attempted here given this environment's inability to
    // verify hand-authored SQL locally (see the migration's header comment
    // and this PR's description).
    const { data: existingRows, error: existingError } = await supabase
      .from("appointment_preparations")
      .select("booking_id, updated_at")
      .eq("shop_id", shopId)
      .in("booking_id", activeBookingIds);

    if (existingError) {
      errors.push(existingError.message);
    } else {
      const touchedAfterRunStarted = new Set(
        (existingRows ?? [])
          .filter((row) => new Date(row.updated_at).getTime() >= now.getTime())
          .map((row) => row.booking_id),
      );

      const rows = preparations
        .filter((prep) => !touchedAfterRunStarted.has(prep.bookingId))
        .map((prep) => ({
          shop_id: prep.shopId,
          booking_id: prep.bookingId,
          vehicle_id: prep.vehicleId,
          customer_id: prep.customerId,
          starts_at: prep.startsAt,
          status: "active" as const,
          resolved_at: null,
          vehicle_snapshot: prep.vehicleSnapshot ?? {},
          customer_snapshot: prep.customerSnapshot ?? {},
          deferred_items: prep.deferredItems,
          matched_menu_items: prep.matchedMenuItems,
          missing_info: prep.missingInfo,
          generated_at: now.toISOString(),
        }));

      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from("appointment_preparations")
          .upsert(rows, { onConflict: "booking_id" });

        if (upsertError) errors.push(upsertError.message);
      }
    }
  }

  return {
    shopId,
    upcoming: preparations.length,
    resolved,
    errors,
  };
}
