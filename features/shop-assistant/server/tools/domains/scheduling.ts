import "server-only";

import { z } from "zod";

import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import {
  defineShopAssistantTool,
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

type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
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

function rpcErrorMessage(error: RpcError): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
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
    throw new ShopAssistantHttpError(404, "Appointment not found in this shop.");
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
        input.note
          ? "The supplied note will be appended to the appointment."
          : "No note will be added.",
        "The appointment update and terminal assistant result will be committed atomically.",
      ],
      targetVersions: booking.updated_at
        ? { [`booking:${booking.id}`]: booking.updated_at }
        : {},
      metadata: { bookingId: booking.id, currentStartsAt: booking.starts_at },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required for atomic appointment rescheduling.");
    }

    const rpc = context.actor.supabase as unknown as RpcClient;
    const { data, error } = await rpc.rpc(
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
    if (error) throw new Error(rpcErrorMessage(error));
    return BookingMutationSchema.parse(data);
  },
});
