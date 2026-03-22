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

  const nextNotes = input.notes
    ? [existing.notes, input.notes].filter(Boolean).join("\n")
    : existing.notes;

  const { data, error } = await supabase
    .from("bookings")
    .update({
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? existing.ends_at,
      notes: nextNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("shop_id", ctx.shopId)
    .eq("id", input.bookingId)
    .select("id, starts_at, ends_at, status")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to reschedule booking");
  }

  return {
    ok: true,
    bookingId: data.id,
    summary: `Booking ${data.id.slice(0, 8)} was moved to ${data.starts_at}.`,
    citations: [
      {
        type: "booking",
        id: data.id,
        href: "/dashboard/appointments",
        label: `${data.status ?? "booking"} • ${data.starts_at}`,
      },
    ],
  };
}
