import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolContext } from "../lib/toolTypes";

const InputSchema = z.object({
  bookingId: z.string().uuid(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1).optional(),
  notes: z.string().optional(),
});

type Input = z.infer<typeof InputSchema>;
type RpcError = { message?: string | null; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

export async function runRescheduleBooking(rawInput: Input, ctx: ToolContext) {
  const input = InputSchema.parse(rawInput);
  const supabase = getServerSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("bookings")
    .select("id, shop_id, starts_at, ends_at, status, notes")
    .eq("shop_id", ctx.shopId)
    .eq("id", input.bookingId)
    .single();

  if (fetchError || !existing) {
    throw new Error(fetchError?.message ?? "Booking not found");
  }

  const endsAt = input.endsAt ?? existing.ends_at;
  const nextNotes = input.notes
    ? [existing.notes, input.notes].filter(Boolean).join("\n")
    : existing.notes;
  const operationKey = [
    ctx.shopId,
    "agent-reschedule",
    input.bookingId,
    input.startsAt,
    endsAt,
  ]
    .join(":")
    .slice(0, 300);

  const { data, error } = await (supabase as unknown as RpcClient).rpc(
    "apply_portal_booking_command_atomic",
    {
      p_action: "reschedule",
      p_booking_id: input.bookingId,
      p_shop_id: null,
      p_customer_id: null,
      p_vehicle_id: null,
      p_starts_at: input.startsAt,
      p_ends_at: endsAt,
      p_notes: nextNotes,
      p_actor_user_id: ctx.userId,
      p_actor_mode: "staff",
      p_operation_key: operationKey,
      p_reason: null,
      p_at: new Date().toISOString(),
    },
  );

  if (error) {
    throw new Error(
      [error.message, error.details, error.hint].filter(Boolean).join(" — ") ||
        "Failed to reschedule booking",
    );
  }

  const booking = (data as {
    booking?: { id?: string; starts_at?: string; status?: string | null };
  } | null)?.booking;
  if (!booking?.id || !booking.starts_at) {
    throw new Error("Scheduler returned no booking after reschedule");
  }

  return {
    ok: true,
    bookingId: booking.id,
    summary: `Booking ${booking.id.slice(0, 8)} was moved to ${booking.starts_at}.`,
    citations: [
      {
        type: "booking",
        id: booking.id,
        href: "/dashboard/appointments",
        label: `${booking.status ?? "booking"} • ${booking.starts_at}`,
      },
    ],
  };
}
