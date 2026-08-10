import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { validateSchedulingSlot } from "./availability";

type DB = Database;

export type BookingSlotValidationResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

export type BookingSlotValidationInput = {
  supabase: SupabaseClient<DB>;
  shopId: string;
  startsAt: string;
  endsAt: string;
  slotMinutes?: number;
  requireOnlineBooking?: boolean;
  enforceShopHours?: boolean;
  mode?: "shop" | "mobile";
  resourceId?: string | null;
};

export async function validateBookingSlot(
  input: BookingSlotValidationInput,
): Promise<BookingSlotValidationResult> {
  const slotMinutes = Math.max(5, Math.min(480, Math.floor(input.slotMinutes ?? 60)));

  // Universal scheduling owns business-hours, time-off and resource-capacity
  // checks. `enforceShopHours=false` is retained only for API compatibility;
  // staff scheduling mutations may bypass this validator and are still protected
  // by resource reservations in the database.
  if (input.enforceShopHours === false) {
    const start = new Date(input.startsAt);
    const end = new Date(input.endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      return { ok: false, error: "Invalid appointment time.", status: 400 };
    }
    if ((end.getTime() - start.getTime()) / 60_000 !== slotMinutes) {
      return {
        ok: false,
        error: `Select a ${slotMinutes}-minute appointment time offered by the shop.`,
        status: 400,
      };
    }
    return { ok: true };
  }

  return validateSchedulingSlot({
    supabase: input.supabase,
    shopId: input.shopId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    slotMinutes,
    mode: input.mode ?? "shop",
    publicOnly: input.requireOnlineBooking ?? false,
    requireOnlineBooking: input.requireOnlineBooking ?? false,
    resourceId: input.resourceId ?? null,
  });
}
