import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type BookingActorMode = "customer-only" | "allow-staff";
type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = SupabaseClient<DB> & {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: RpcError | null }>;
};

export type CreatePortalBookingInput = {
  shopSlug: string;
  startsAt: string;
  endsAt: string;
  notes?: string;
  vehicleId?: string | null;
  customerId?: string | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  operationKey?: string;
  idempotencyKey?: string;
};

export type CreatePortalBookingResult =
  | { ok: true; booking: DB["public"]["Tables"]["bookings"]["Row"] }
  | { ok: false; error: string; status: number };

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function statusFor(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("overlap")) return 409;
  if (lower.includes("not found")) return 404;
  if (
    lower.includes("not authorized") ||
    lower.includes("another shop") ||
    lower.includes("actor mismatch") ||
    lower.includes("does not belong")
  ) {
    return 403;
  }
  return 400;
}

export async function createPortalBooking({
  supabase,
  userId,
  input,
  actorMode,
}: {
  supabase: SupabaseClient<DB>;
  userId: string;
  input: CreatePortalBookingInput;
  actorMode: BookingActorMode;
}): Promise<CreatePortalBookingResult> {
  const shopSlug = clean(input.shopSlug);
  const startsAt = clean(input.startsAt);
  const endsAt = clean(input.endsAt);
  const vehicleId = clean(input.vehicleId) || null;
  const suppliedCustomerId = clean(input.customerId);
  const operationKey = clean(input.operationKey) || clean(input.idempotencyKey);

  if (!shopSlug || !startsAt || !endsAt) {
    return { ok: false, error: "Missing shopSlug, startsAt, or endsAt", status: 400 };
  }
  if (!operationKey) {
    return { ok: false, error: "A stable operation key is required", status: 400 };
  }

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id")
    .eq("slug", shopSlug)
    .maybeSingle<{ id: string }>();
  if (shopError) return { ok: false, error: shopError.message, status: 500 };
  if (!shop) return { ok: false, error: "Shop not found", status: 404 };

  let customerId = suppliedCustomerId;
  if (actorMode === "customer-only") {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle<{ id: string }>();
    if (customerError) {
      return { ok: false, error: customerError.message, status: 500 };
    }
    if (!customer) {
      return { ok: false, error: "Customer profile not found for this user", status: 404 };
    }
    customerId = customer.id;
  }

  if (!customerId) {
    return {
      ok: false,
      error: "A canonical customer is required before staff booking creation",
      status: 400,
    };
  }

  const { data, error } = await (supabase as RpcClient).rpc(
    "apply_portal_booking_command_atomic",
    {
      p_action: "create",
      p_booking_id: null,
      p_shop_id: shop.id,
      p_customer_id: customerId,
      p_vehicle_id: vehicleId,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_notes: clean(input.notes) || null,
      p_actor_user_id: userId,
      p_actor_mode: actorMode === "customer-only" ? "customer" : "staff",
      p_operation_key: `${shop.id}:booking-create:${operationKey}`,
      p_reason: null,
      p_at: new Date().toISOString(),
    },
  );

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    return { ok: false, error: message, status: statusFor(message) };
  }

  const booking = (data as { booking?: DB["public"]["Tables"]["bookings"]["Row"] })
    ?.booking;
  if (!booking) {
    return { ok: false, error: "Booking command returned no booking", status: 500 };
  }
  return { ok: true, booking };
}
