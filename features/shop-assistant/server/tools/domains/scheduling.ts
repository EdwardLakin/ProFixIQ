import "server-only";

import { z } from "zod";

import { defineShopAssistantTool } from "../types";

const BookingSchema = z.object({
  id: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  status: z.string().nullable(),
  customerId: z.string().uuid().nullable(),
  vehicleId: z.string().uuid().nullable(),
  workOrderId: z.string().uuid().nullable(),
});

const BookingListSchema = z.object({
  ok: z.literal(true),
  bookings: z.array(BookingSchema),
  summary: z.string(),
  href: z.string(),
});

const BookingMutationSchema = z.object({
  ok: z.literal(true),
  booking: BookingSchema,
  summary: z.string(),
  href: z.string(),
});

type BookingRow = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  status: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  work_order_id: string | null;
  notes: string | null;
  updated_at: string | null;
};

function mapBooking(row: BookingRow) {
  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    customerId: row.customer_id,
    vehicleId: row.vehicle_id,
    workOrderId: row.work_order_id,
  };
}

async function loadBooking(
  bookingId: string,
  context: Parameters<
    NonNullable<ReturnType<typeof defineShopAssistantTool>["execute"]>
  >[1],
): Promise<BookingRow> {
  const { data, error } = await context.actor.supabase
    .from("bookings")
    .select(
      "id, starts_at, ends_at, status, customer_id, vehicle_id, work_order_id, notes, updated_at",
    )
    .eq("shop_id", context.actor.shopId)
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Appointment not found in this shop.");
  return data as BookingRow;
}

export const listBookingsTool = defineShopAssistantTool({
  name: "list_bookings",
  domain: "scheduling",
  description: "List shop-scoped appointments in a date range.",
  mode: "read",
  risk: "low",
  requiredCapability: "canManageScheduling",
  confirmation: "never",
  inputSchema: z.object({
    startsAfter: z.string().optional(),
    startsBefore: z.string().optional(),
    status: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: BookingListSchema,
  async execute(input, context) {
    let query = context.actor.supabase
      .from("bookings")
      .select(
        "id, starts_at, ends_at, status, customer_id, vehicle_id, work_order_id, notes, updated_at",
      )
      .eq("shop_id", context.actor.shopId)
      .order("starts_at", { ascending: true })
      .limit(input.limit);
    if (input.startsAfter) query = query.gte("starts_at", input.startsAfter);
    if (input.startsBefore) query = query.lt("starts_at", input.startsBefore);
    if (input.status) query = query.eq("status", input.status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const bookings = ((data ?? []) as BookingRow[]).map(mapBooking);
    return {
      ok: true as const,
      bookings,
      summary: `${bookings.length} appointment(s) matched the requested window.`,
      href: "/dashboard/appointments",
    };
  },
});

export const rescheduleBookingTool = defineShopAssistantTool({
  name: "reschedule_booking",
  domain: "scheduling",
  description: "Move one appointment to a new start and optional end time.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canManageScheduling",
  confirmation: "required",
  inputSchema: z.object({
    bookingId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().optional(),
    note: z.string().trim().max(1000).optional(),
  }),
  outputSchema: BookingMutationSchema,
  async preview(input, context) {
    const booking = await loadBooking(input.bookingId, context);
    return {
      title: "Reschedule appointment",
      summary: `Move the appointment from ${booking.starts_at} to ${input.startsAt}.`,
      consequences: [
        "The new time will immediately replace the current appointment time.",
        input.note ? "The supplied note will be appended to the appointment." : "No note will be added.",
      ],
      targetVersions: booking.updated_at
        ? { [`booking:${booking.id}`]: booking.updated_at }
        : {},
      metadata: { bookingId: booking.id, currentStartsAt: booking.starts_at },
    };
  },
  async execute(input, context) {
    const booking = await loadBooking(input.bookingId, context);
    const expectedVersion = context.targetVersions?.[`booking:${booking.id}`];
    if (expectedVersion && booking.updated_at !== expectedVersion) {
      throw new Error(
        "The appointment changed after the preview. Review the latest schedule before confirming again.",
      );
    }

    const notes = input.note
      ? [booking.notes, input.note].filter(Boolean).join("\n")
      : booking.notes;
    let update = context.actor.supabase
      .from("bookings")
      .update({
        starts_at: input.startsAt,
        ends_at: input.endsAt ?? booking.ends_at,
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq("shop_id", context.actor.shopId)
      .eq("id", booking.id);
    if (expectedVersion) update = update.eq("updated_at", expectedVersion);

    const { data, error } = await update
      .select(
        "id, starts_at, ends_at, status, customer_id, vehicle_id, work_order_id, notes, updated_at",
      )
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error(
        "The appointment changed before it could be rescheduled. Review and try again.",
      );
    }

    const mapped = mapBooking(data as BookingRow);
    return {
      ok: true as const,
      booking: mapped,
      summary: `Appointment ${mapped.id.slice(0, 8)} was moved to ${mapped.startsAt}.`,
      href: "/dashboard/appointments",
    };
  },
});
