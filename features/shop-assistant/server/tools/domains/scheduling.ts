import "server-only";

import { z } from "zod";

import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import {
  defineShopAssistantTool,
  runShopAssistantCommandRpc,
  type ShopAssistantToolContext,
} from "../types";

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
  conflicts: z.array(
    z.object({
      firstBookingId: z.string().uuid(),
      secondBookingId: z.string().uuid(),
      startsAt: z.string(),
      endsAt: z.string(),
    }),
  ),
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
  context: ShopAssistantToolContext,
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
  if (!data) {
    throw new ShopAssistantHttpError(
      404,
      "Appointment not found in this shop.",
    );
  }
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
    const activeBookings = bookings.filter(
      (booking) =>
        booking.status !== "cancelled" &&
        booking.status !== "canceled" &&
        booking.endsAt,
    );
    const conflicts: Array<{
      firstBookingId: string;
      secondBookingId: string;
      startsAt: string;
      endsAt: string;
    }> = [];
    for (let left = 0; left < activeBookings.length; left += 1) {
      for (let right = left + 1; right < activeBookings.length; right += 1) {
        const first = activeBookings[left];
        const second = activeBookings[right];
        if (!first?.endsAt || !second?.endsAt) continue;
        const overlapStart = Math.max(
          new Date(first.startsAt).getTime(),
          new Date(second.startsAt).getTime(),
        );
        const overlapEnd = Math.min(
          new Date(first.endsAt).getTime(),
          new Date(second.endsAt).getTime(),
        );
        if (overlapStart >= overlapEnd) continue;
        conflicts.push({
          firstBookingId: first.id,
          secondBookingId: second.id,
          startsAt: new Date(overlapStart).toISOString(),
          endsAt: new Date(overlapEnd).toISOString(),
        });
      }
    }
    return {
      ok: true as const,
      bookings,
      conflicts,
      summary: `${bookings.length} appointment(s) matched the requested window; ${conflicts.length} overlapping pair(s) were detected.`,
      href: "/dashboard/appointments",
    };
  },
});

export const createBookingTool = defineShopAssistantTool({
  name: "create_booking",
  domain: "scheduling",
  description:
    "Create a shop or mobile-service appointment through the canonical capacity scheduler.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canManageScheduling",
  allowedRoles: ["owner", "admin", "manager", "advisor"],
  confirmation: "required",
  inputSchema: z.object({
    customerId: z.string().uuid(),
    vehicleId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    notes: z.string().trim().max(2000).optional(),
    mode: z.enum(["shop", "mobile"]).default("shop"),
    resourceId: z.string().uuid().optional(),
  }),
  outputSchema: BookingMutationSchema,
  async preview(input, context) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new ShopAssistantHttpError(
        400,
        "Appointment end must be after its start.",
      );
    }

    const [
      { data: customer, error: customerError },
      { data: vehicle, error: vehicleError },
    ] = await Promise.all([
      context.actor.supabase
        .from("customers")
        .select("id, name, first_name, last_name")
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.customerId)
        .maybeSingle(),
      context.actor.supabase
        .from("vehicles")
        .select(
          "id, customer_id, year, make, model, unit_number, license_plate",
        )
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.vehicleId)
        .maybeSingle(),
    ]);
    if (customerError) throw new Error(customerError.message);
    if (vehicleError) throw new Error(vehicleError.message);
    if (!customer) {
      throw new ShopAssistantHttpError(404, "Customer not found in this shop.");
    }
    if (!vehicle || vehicle.customer_id !== input.customerId) {
      throw new ShopAssistantHttpError(
        404,
        "Vehicle was not found for this customer and shop.",
      );
    }
    const customerName =
      customer.name?.trim() ||
      [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
      "the customer";
    const vehicleName =
      [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
      vehicle.unit_number ||
      vehicle.license_plate ||
      "the vehicle";
    return {
      title: `Book ${customerName}`,
      summary: `Schedule ${vehicleName} from ${input.startsAt} to ${input.endsAt}.`,
      consequences: [
        `Service mode: ${input.mode}.`,
        "The canonical scheduler will enforce notice, lead-time, and resource-capacity rules.",
        input.notes
          ? "The supplied appointment notes will be saved."
          : "No appointment notes will be saved.",
        "The booking and terminal assistant result will be committed atomically.",
      ],
      metadata: {
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error(
        "An action id is required for atomic appointment creation.",
      );
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_create_booking_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_customer_id: input.customerId,
        p_vehicle_id: input.vehicleId,
        p_starts_at: input.startsAt,
        p_ends_at: input.endsAt,
        p_notes: input.notes ?? null,
        p_mode: input.mode,
        p_resource_id: input.resourceId ?? null,
      },
    );
    return BookingMutationSchema.parse(data);
  },
});

export const cancelBookingTool = defineShopAssistantTool({
  name: "cancel_booking",
  domain: "scheduling",
  description: "Cancel a non-terminal shop appointment with an audit reason.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canManageScheduling",
  allowedRoles: ["owner", "admin", "manager", "advisor"],
  confirmation: "required",
  inputSchema: z.object({
    bookingId: z.string().uuid(),
    reason: z.string().trim().min(2).max(1000),
  }),
  outputSchema: BookingMutationSchema,
  async preview(input, context) {
    const booking = await loadBooking(input.bookingId, context);
    const status = String(booking.status ?? "").toLowerCase();
    if (["cancelled", "canceled", "completed"].includes(status)) {
      throw new ShopAssistantHttpError(
        409,
        "This appointment is already terminal.",
      );
    }
    return {
      title: "Cancel appointment",
      summary: `Cancel the ${booking.starts_at} appointment for: ${input.reason}`,
      consequences: [
        "The appointment will leave active scheduling capacity.",
        "Any linked work order will remain intact.",
        "The cancellation reason and actor will be recorded.",
      ],
      targetVersions: {
        [`booking:${booking.id}`]: booking.updated_at ?? "missing",
      },
      metadata: { bookingId: booking.id, currentStatus: booking.status },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error(
        "An action id is required for atomic appointment cancellation.",
      );
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_cancel_booking_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_booking_id: input.bookingId,
        p_actor_user_id: context.actor.userId,
        p_reason: input.reason,
      },
    );
    return BookingMutationSchema.parse(data);
  },
});

export const rescheduleBookingTool = defineShopAssistantTool({
  name: "reschedule_booking",
  domain: "scheduling",
  description: "Move one appointment to a new start and optional end time.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canManageScheduling",
  allowedRoles: ["owner", "admin", "manager", "advisor"],
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
        input.note
          ? "The supplied note will be appended to the appointment."
          : "No note will be added.",
        "The appointment update and terminal assistant result will be committed atomically.",
      ],
      targetVersions: {
        [`booking:${booking.id}`]: booking.updated_at ?? "missing",
      },
      metadata: { bookingId: booking.id, currentStartsAt: booking.starts_at },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error(
        "An action id is required for atomic appointment rescheduling.",
      );
    }

    const data = await runShopAssistantCommandRpc(
      "shop_assistant_reschedule_booking_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_booking_id: input.bookingId,
        p_actor_user_id: context.actor.userId,
        p_starts_at: input.startsAt,
        p_ends_at: input.endsAt ?? null,
        p_note: input.note ?? null,
      },
    );
    return BookingMutationSchema.parse(data);
  },
});
