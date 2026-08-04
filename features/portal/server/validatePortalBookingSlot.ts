import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type LocalParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
};

type ValidationResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

function localParts(value: Date, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(value).map((part) => [part.type, part.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    String(parts.weekday ?? ""),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

function weekdayCandidates(raw: unknown): number[] {
  const value = Number(raw);
  if (!Number.isFinite(value)) return [];
  if (value >= 0 && value <= 6) return [value];
  if (value >= 1 && value <= 7) {
    return Array.from(new Set([value % 7, value - 1])).filter(
      (candidate) => candidate >= 0 && candidate <= 6,
    );
  }
  return [];
}

function minuteOfDay(value: string | null | undefined): number | null {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export async function validateRequestedPortalSlot(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  startsAt: string;
  endsAt: string;
}): Promise<ValidationResult> {
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;

  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 15 ||
    durationMinutes > 180
  ) {
    return { ok: false, error: "Select a valid appointment duration.", status: 400 };
  }

  const { data: shop, error: shopError } = await input.supabase
    .from("shops")
    .select("id,timezone,accepts_online_booking,min_notice_minutes,max_lead_days")
    .eq("id", input.shopId)
    .maybeSingle();
  if (shopError) {
    return { ok: false, error: "Unable to validate appointment availability.", status: 500 };
  }
  if (!shop?.accepts_online_booking) {
    return { ok: false, error: "Online appointment booking is not enabled for this shop.", status: 409 };
  }

  const now = Date.now();
  const minNotice = Math.max(0, Number(shop.min_notice_minutes ?? 120));
  const maxLeadDays = Math.max(1, Number(shop.max_lead_days ?? 30));
  if (start.getTime() < now + minNotice * 60_000) {
    return { ok: false, error: "This appointment does not meet the shop's minimum notice.", status: 409 };
  }
  if (start.getTime() > now + maxLeadDays * 86_400_000) {
    return { ok: false, error: "This appointment is beyond the shop's booking window.", status: 409 };
  }

  const timeZone = shop.timezone || "UTC";
  const localStart = localParts(start, timeZone);
  const localEnd = localParts(end, timeZone);
  if (
    localStart.year !== localEnd.year ||
    localStart.month !== localEnd.month ||
    localStart.day !== localEnd.day
  ) {
    return { ok: false, error: "Appointments must remain within one shop business day.", status: 409 };
  }
  if (localStart.minute % 15 !== 0) {
    return { ok: false, error: "Select one of the appointment times offered by the shop.", status: 409 };
  }

  const { data: hours, error: hoursError } = await input.supabase
    .from("shop_hours")
    .select("weekday,open_time,close_time")
    .eq("shop_id", input.shopId);
  if (hoursError) {
    return { ok: false, error: "Unable to validate shop hours.", status: 500 };
  }

  const startMinute = localStart.hour * 60 + localStart.minute;
  const endMinute = localEnd.hour * 60 + localEnd.minute;
  const insideBusinessHours = (hours ?? []).some((row) => {
    if (!weekdayCandidates(row.weekday).includes(localStart.weekday)) return false;
    const open = minuteOfDay(row.open_time);
    const close = minuteOfDay(row.close_time);
    return open != null && close != null && close > open && startMinute >= open && endMinute <= close;
  });
  if (!insideBusinessHours) {
    return { ok: false, error: "That time is outside the shop's booking hours.", status: 409 };
  }

  const [timeOffResult, bookingResult] = await Promise.all([
    input.supabase
      .from("shop_time_off")
      .select("id")
      .eq("shop_id", input.shopId)
      .lt("starts_at", input.endsAt)
      .gt("ends_at", input.startsAt)
      .limit(1),
    input.supabase
      .from("bookings")
      .select("id")
      .eq("shop_id", input.shopId)
      .in("status", ["pending", "confirmed"])
      .lt("starts_at", input.endsAt)
      .gt("ends_at", input.startsAt)
      .limit(1),
  ]);
  if (timeOffResult.error || bookingResult.error) {
    return { ok: false, error: "Unable to confirm appointment availability.", status: 500 };
  }
  if ((timeOffResult.data?.length ?? 0) > 0 || (bookingResult.data?.length ?? 0) > 0) {
    return { ok: false, error: "That appointment time is no longer available.", status: 409 };
  }

  return { ok: true };
}
