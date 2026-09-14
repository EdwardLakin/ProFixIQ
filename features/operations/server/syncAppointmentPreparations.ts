import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import { buildAppointmentPreparations } from "./appointmentPreparation/buildAppointmentPreparations";

type DB = Database;
type Booking = Pick<
  DB["public"]["Tables"]["bookings"]["Row"],
  "id" | "starts_at" | "status" | "customer_id" | "vehicle_id" | "notes"
>;

// Bookings up to a week out are worth preparing ahead of time; further out
// than that the picture is still likely to change (rescheduling, vehicle
// swaps) before it matters.
const PREP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const EXCLUDED_BOOKING_STATUSES = new Set(["cancelled", "canceled", "completed"]);

export type SyncAppointmentPreparationsSummary = {
  shopId: string;
  upcoming: number;
  resolved: number;
  errors: string[];
};

export async function syncAppointmentPreparations(input: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  now?: Date;
}): Promise<SyncAppointmentPreparationsSummary> {
  const { supabase, shopId } = input;
  const now = input.now ?? new Date();
  const windowEnd = new Date(now.getTime() + PREP_WINDOW_MS);
  const errors: string[] = [];

  const { data, error } = await supabase
    .from("bookings")
    .select("id, starts_at, status, customer_id, vehicle_id, notes")
    .eq("shop_id", shopId)
    .gte("starts_at", now.toISOString())
    .lt("starts_at", windowEnd.toISOString())
    .order("starts_at", { ascending: true });

  if (error) {
    return { shopId, upcoming: 0, resolved: 0, errors: [error.message] };
  }

  const bookings: Booking[] = (data ?? []).filter(
    (row) => !EXCLUDED_BOOKING_STATUSES.has(String(row.status ?? "").toLowerCase()),
  );

  const preparations = await buildAppointmentPreparations({
    admin: supabase,
    shopId,
    bookings,
    canViewPricing: true,
  });

  let resolved = 0;
  const activeBookingIds = preparations.map((p) => p.bookingId);

  // Any previously-active preparation whose booking is no longer upcoming
  // (past, cancelled, or newly outside the lookahead window) is resolved
  // rather than deleted, so the projection stays a durable, auditable record.
  const resolveQuery = supabase
    .from("appointment_preparations")
    .update({ status: "resolved", resolved_at: now.toISOString() })
    .eq("shop_id", shopId)
    .eq("status", "active");
  const { data: resolvedRows, error: resolveError } =
    activeBookingIds.length > 0
      ? await resolveQuery.not("booking_id", "in", `(${activeBookingIds.join(",")})`).select("id")
      : await resolveQuery.select("id");

  if (resolveError) {
    errors.push(resolveError.message);
  } else {
    resolved = resolvedRows?.length ?? 0;
  }

  if (preparations.length > 0) {
    const rows = preparations.map((prep) => ({
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

    const { error: upsertError } = await supabase
      .from("appointment_preparations")
      .upsert(rows, { onConflict: "booking_id" });

    if (upsertError) errors.push(upsertError.message);
  }

  return {
    shopId,
    upcoming: preparations.length,
    resolved,
    errors,
  };
}
