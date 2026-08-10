import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { validateBookingSlot } from "@/features/scheduling/server/validateBookingSlot";

type DB = Database;

const PORTAL_SLOT_MINUTES = 60;

type ValidationResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

export async function validateRequestedPortalSlot(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  startsAt: string;
  endsAt: string;
}): Promise<ValidationResult> {
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;

  // Preserve the existing portal contract exactly while delegating the actual
  // availability policy to the shared scheduling engine.
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    durationMinutes !== PORTAL_SLOT_MINUTES
  ) {
    return {
      ok: false,
      error: "Select one of the one-hour appointment times offered by the shop.",
      status: 400,
    };
  }

  return validateBookingSlot({
    ...input,
    slotMinutes: PORTAL_SLOT_MINUTES,
    requireOnlineBooking: true,
    enforceShopHours: true,
  });
}
