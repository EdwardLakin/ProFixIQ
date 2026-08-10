import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type RpcError = { message?: string | null; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

export type SchedulerResource = {
  id: string;
  name: string;
  code: string;
  resourceType: "capacity" | "bay" | "technician" | "service_vehicle";
  mode: "shop" | "mobile" | "both";
  publicBookable: boolean;
};

export type SchedulerSlot = {
  start: string;
  end: string;
  localDate: string;
  availableResourceIds: string[];
};

export type SchedulingAvailability = {
  tz: string;
  slots: SchedulerSlot[];
  resources: SchedulerResource[];
  disabled?: boolean;
};

type BusyReservation = {
  resourceId: string;
  eventId: string;
  startsAt: string;
  endsAt: string;
};

type Snapshot = {
  resources?: SchedulerResource[];
  reservations?: BusyReservation[];
};

type AvailabilityInput = {
  supabase: SupabaseClient<DB>;
  shopId?: string;
  shopSlug?: string;
  startYMD: string;
  endYMD: string;
  slotMinutes: number;
  mode?: "shop" | "mobile";
  publicOnly?: boolean;
  requireOnlineBooking?: boolean;
  resourceId?: string | null;
  now?: Date;
};

const DAY_MS = 86_400_000;

function rpcMessage(error: RpcError): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

function parseYMD(value: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Invalid scheduling date.");
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() + 1 !== m ||
    probe.getUTCDate() !== d
  ) {
    throw new Error("Invalid scheduling date.");
  }
  return { y, m, d };
}

function* iterateDays(startYMD: string, endYMD: string) {
  const start = parseYMD(startYMD);
  const end = parseYMD(endYMD);
  const first = Date.UTC(start.y, start.m - 1, start.d);
  const last = Date.UTC(end.y, end.m - 1, end.d);
  if (last < first || last - first > 93 * DAY_MS) {
    throw new Error("Scheduling range is invalid or too large.");
  }
  for (let time = first; time <= last; time += DAY_MS) {
    const value = new Date(time);
    yield {
      y: value.getUTCFullYear(),
      m: value.getUTCMonth() + 1,
      d: value.getUTCDate(),
      ymd: value.toISOString().slice(0, 10),
    };
  }
}

export function makeZonedDate(
  timeZone: string,
  y: number,
  m: number,
  d: number,
  hour = 0,
  minute = 0,
): Date {
  const tentative = new Date(Date.UTC(y, m - 1, d, hour, minute, 0, 0));
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(tentative).map((part) => [part.type, part.value]),
  );
  const wanted = Date.UTC(y, m - 1, d, hour, minute);
  const observed = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
  );
  return new Date(tentative.getTime() + (wanted - observed));
}

function weekdayForLocalYMD(
  timeZone: string,
  y: number,
  m: number,
  d: number,
): number {
  const probe = makeZonedDate(timeZone, y, m, d, 12, 0);
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(probe);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value);
  return index >= 0 ? index : probe.getUTCDay();
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

function parseHm(raw: string | null | undefined): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(raw ?? "").trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function overlaps(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function exactInstant(left: string, right: string): boolean {
  const a = Date.parse(left);
  const b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function localYmd(value: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(value).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function getSchedulingAvailability(
  input: AvailabilityInput,
): Promise<SchedulingAvailability> {
  const slotMinutes = Math.max(5, Math.min(480, Math.floor(input.slotMinutes)));
  const mode = input.mode ?? "shop";
  const publicOnly = input.publicOnly ?? false;
  const requireOnlineBooking = input.requireOnlineBooking ?? false;
  const now = input.now ?? new Date();

  let shopQuery = input.supabase
    .from("shops")
    .select("id,slug,timezone,accepts_online_booking,min_notice_minutes,max_lead_days");
  if (input.shopId) shopQuery = shopQuery.eq("id", input.shopId);
  else if (input.shopSlug) shopQuery = shopQuery.eq("slug", input.shopSlug);
  else throw new Error("A shop id or slug is required.");

  const { data: shop, error: shopError } = await shopQuery.maybeSingle();
  if (shopError) throw new Error(shopError.message);
  if (!shop) throw new Error("Shop not found.");

  const tz = shop.timezone || "UTC";
  if (requireOnlineBooking && !shop.accepts_online_booking) {
    return { tz, slots: [], resources: [], disabled: true };
  }

  const start = parseYMD(input.startYMD);
  const end = parseYMD(input.endYMD);
  const windowStart = makeZonedDate(tz, start.y, start.m, start.d, 0, 0);
  const windowEnd = new Date(
    makeZonedDate(tz, end.y, end.m, end.d, 23, 59).getTime() + 60_000,
  );

  const [hoursResult, timeOffResult, snapshotResult] = await Promise.all([
    input.supabase
      .from("shop_hours")
      .select("weekday,open_time,close_time")
      .eq("shop_id", shop.id),
    input.supabase
      .from("shop_time_off")
      .select("starts_at,ends_at")
      .eq("shop_id", shop.id)
      .lt("starts_at", windowEnd.toISOString())
      .gt("ends_at", windowStart.toISOString()),
    (input.supabase as unknown as RpcClient).rpc("scheduler_availability_snapshot", {
      p_shop_id: shop.id,
      p_window_start: windowStart.toISOString(),
      p_window_end: windowEnd.toISOString(),
      p_mode: mode,
      p_public_only: publicOnly,
      p_resource_id: input.resourceId ?? null,
    }),
  ]);

  if (hoursResult.error) throw new Error(hoursResult.error.message);
  if (timeOffResult.error) throw new Error(timeOffResult.error.message);
  if (snapshotResult.error) throw new Error(rpcMessage(snapshotResult.error));

  const snapshot = (snapshotResult.data ?? {}) as Snapshot;
  const resources = Array.isArray(snapshot.resources) ? snapshot.resources : [];
  const reservations = Array.isArray(snapshot.reservations)
    ? snapshot.reservations
    : [];
  if (resources.length === 0) return { tz, slots: [], resources };

  const minNoticeMinutes = Math.max(0, Number(shop.min_notice_minutes ?? 120));
  const maxLeadDays = Math.max(1, Number(shop.max_lead_days ?? 30));
  const earliest = now.getTime() + minNoticeMinutes * 60_000;
  const latest = now.getTime() + maxLeadDays * DAY_MS;
  const timeOff = (timeOffResult.data ?? []).map((row) => ({
    start: new Date(row.starts_at),
    end: new Date(row.ends_at),
  }));
  const busyByResource = new Map<string, Array<{ start: Date; end: Date }>>();
  for (const reservation of reservations) {
    const list = busyByResource.get(reservation.resourceId) ?? [];
    list.push({
      start: new Date(reservation.startsAt),
      end: new Date(reservation.endsAt),
    });
    busyByResource.set(reservation.resourceId, list);
  }

  const slots: SchedulerSlot[] = [];
  for (const day of iterateDays(input.startYMD, input.endYMD)) {
    const weekday = weekdayForLocalYMD(tz, day.y, day.m, day.d);
    const dayHours = (hoursResult.data ?? []).filter((row) =>
      weekdayCandidates(row.weekday).includes(weekday),
    );

    for (const row of dayHours) {
      const open = parseHm(row.open_time);
      const close = parseHm(row.close_time);
      if (!open || !close) continue;
      const opensAt = makeZonedDate(tz, day.y, day.m, day.d, open.h, open.m);
      const closesAt = makeZonedDate(tz, day.y, day.m, day.d, close.h, close.m);
      if (closesAt <= opensAt) continue;

      for (
        let cursor = new Date(opensAt);
        cursor.getTime() + slotMinutes * 60_000 <= closesAt.getTime();
        cursor = new Date(cursor.getTime() + slotMinutes * 60_000)
      ) {
        const slotEnd = new Date(cursor.getTime() + slotMinutes * 60_000);
        if (cursor.getTime() < earliest || cursor.getTime() > latest) continue;
        if (timeOff.some((window) => overlaps(cursor, slotEnd, window.start, window.end))) {
          continue;
        }

        const availableResourceIds = resources
          .filter((resource) =>
            !(busyByResource.get(resource.id) ?? []).some((window) =>
              overlaps(cursor, slotEnd, window.start, window.end),
            ),
          )
          .map((resource) => resource.id);
        if (availableResourceIds.length === 0) continue;

        slots.push({
          start: cursor.toISOString(),
          end: slotEnd.toISOString(),
          localDate: day.ymd,
          availableResourceIds,
        });
      }
    }
  }

  return { tz, slots, resources };
}

export async function validateSchedulingSlot(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  startsAt: string;
  endsAt: string;
  slotMinutes: number;
  mode?: "shop" | "mobile";
  publicOnly?: boolean;
  requireOnlineBooking?: boolean;
  resourceId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return { ok: false, error: "Invalid appointment time.", status: 400 };
  }
  const duration = (end.getTime() - start.getTime()) / 60_000;
  if (duration !== input.slotMinutes) {
    return {
      ok: false,
      error: `Select a ${input.slotMinutes}-minute appointment time offered by the shop.`,
      status: 400,
    };
  }

  const { data: shop, error } = await input.supabase
    .from("shops")
    .select("timezone")
    .eq("id", input.shopId)
    .maybeSingle();
  if (error || !shop) {
    return { ok: false, error: "Unable to validate appointment availability.", status: 500 };
  }
  const day = localYmd(start, shop.timezone || "UTC");
  try {
    const availability = await getSchedulingAvailability({
      supabase: input.supabase,
      shopId: input.shopId,
      startYMD: day,
      endYMD: day,
      slotMinutes: input.slotMinutes,
      mode: input.mode,
      publicOnly: input.publicOnly,
      requireOnlineBooking: input.requireOnlineBooking,
      resourceId: input.resourceId,
    });
    if (availability.disabled) {
      return { ok: false, error: "Online appointment booking is not enabled for this shop.", status: 409 };
    }
    const matched = availability.slots.some(
      (slot) => exactInstant(slot.start, input.startsAt) && exactInstant(slot.end, input.endsAt),
    );
    return matched
      ? { ok: true }
      : { ok: false, error: "That appointment time is no longer available.", status: 409 };
  } catch {
    return { ok: false, error: "Unable to confirm appointment availability.", status: 500 };
  }
}
