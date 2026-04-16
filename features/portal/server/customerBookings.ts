import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export type CustomerBookingPayload = Pick<
  DB["public"]["Tables"]["bookings"]["Row"],
  "id" | "starts_at" | "ends_at" | "notes" | "status"
>;

export async function listCustomerBookings({
  supabase,
  customerId,
}: {
  supabase: SupabaseClient<DB>;
  customerId: string;
}): Promise<{ ok: true; data: CustomerBookingPayload[] } | { ok: false; error: string; status: number }> {
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, notes, status")
    .eq("customer_id", customerId)
    .order("starts_at", { ascending: true });

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data: Array.isArray(bookings) ? bookings : [] };
}

export async function cancelCustomerBooking({
  supabase,
  customerId,
  bookingId,
}: {
  supabase: SupabaseClient<DB>;
  customerId: string;
  bookingId: string;
}): Promise<{ ok: true; data: CustomerBookingPayload } | { ok: false; error: string; status: number }> {
  const { data: updated, error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .eq("customer_id", customerId)
    .select("id, starts_at, ends_at, notes, status")
    .maybeSingle();

  if (error) return { ok: false, error: error.message, status: 500 };
  if (!updated) return { ok: false, error: "Booking not found", status: 404 };
  return { ok: true, data: updated };
}
