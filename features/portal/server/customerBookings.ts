import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = SupabaseClient<DB> & {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: RpcError | null }>;
};

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
}): Promise<
  | { ok: true; data: CustomerBookingPayload[] }
  | { ok: false; error: string; status: number }
> {
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
  actorUserId,
  operationKey,
  reason,
}: {
  supabase: SupabaseClient<DB>;
  customerId: string;
  bookingId: string;
  actorUserId: string;
  operationKey: string;
  reason?: string | null;
}): Promise<
  | { ok: true; data: CustomerBookingPayload }
  | { ok: false; error: string; status: number }
> {
  const { data, error } = await (supabase as RpcClient).rpc(
    "apply_portal_booking_command_atomic",
    {
      p_action: "cancel",
      p_booking_id: bookingId,
      p_shop_id: null,
      p_customer_id: customerId,
      p_vehicle_id: null,
      p_starts_at: null,
      p_ends_at: null,
      p_notes: null,
      p_actor_user_id: actorUserId,
      p_actor_mode: "customer",
      p_operation_key: operationKey,
      p_reason: reason ?? "Customer cancelled",
      p_at: new Date().toISOString(),
    },
  );

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    const lower = message.toLowerCase();
    const status = lower.includes("not found")
      ? 404
      : lower.includes("not owned") || lower.includes("cannot be changed")
        ? 403
        : lower.includes("terminal state") || lower.includes("work-order-linked")
          ? 409
          : 400;
    return { ok: false, error: message, status };
  }

  const booking = (data as { booking?: CustomerBookingPayload })?.booking;
  if (!booking) {
    return { ok: false, error: "Booking command returned no booking", status: 500 };
  }
  return { ok: true, data: booking };
}
