// app/api/portal/availability/route.ts
import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

/** Build a Date in UTC that corresponds to local components in a given IANA tz. */
function makeZonedDate(
  tz: string,
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
) {
  const tentative = new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0));
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    fmt.formatToParts(tentative).map((p) => [p.type, p.value]),
  );

  const want = Date.UTC(y, m - 1, d, hh, mm);
  const got = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );

  return new Date(tentative.getTime() + (want - got));
}

function parseYMD(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) throw new Error("Invalid date");
  return { y, m, d };
}

function* iterateDays(startYMD: string, endYMD: string) {
  const s = parseYMD(startYMD);
  const e = parseYMD(endYMD);
  const d0 = new Date(Date.UTC(s.y, s.m - 1, s.d));
  const d1 = new Date(Date.UTC(e.y, e.m - 1, e.d));
  for (let t = d0.getTime(); t <= d1.getTime(); t += 24 * 60 * 60 * 1000) {
    const dt = new Date(t);
    yield {
      utc: dt,
      y: dt.getUTCFullYear(),
      m: dt.getUTCMonth() + 1,
      d: dt.getUTCDate(),
    };
  }
}

const addMinutes = (date: Date, mins: number) =>
  new Date(date.getTime() + mins * 60_000);

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart < bEnd && bStart < aEnd;

function parseHm(time: string | null | undefined): { h: number; m: number } | null {
  if (!time) return null;

  // accept "HH:MM" or "HH:MM:SS" and tolerate suffixes like "+00"
  const cleaned = time.trim().split(/[^\d:]/)[0] ?? "";
  const [hhS, mmS] = cleaned.split(":");
  const hh = Number(hhS);
  const mm = Number(mmS);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  return { h: hh, m: mm };
}

/**
 * IMPORTANT FIX:
 * Determine the weekday for a given LOCAL Y-M-D in the shop timezone.
 * We probe at local noon to avoid DST/offset edge weirdness.
 * Returns 0..6 (Sun..Sat).
 */
function weekdayForLocalYMD(tz: string, y: number, m: number, d: number): number {
  const probe = makeZonedDate(tz, y, m, d, 12, 0);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
  const w = fmt.format(probe);
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(w);
  return idx >= 0 ? idx : probe.getUTCDay();
}

/**
 * Normalize shop_hours.weekday to possible JS weekdays (0..6).
 * Supports:
 * - 0..6 already
 * - 1..7 Mon=1..Sun=7  => js = raw % 7
 * - 1..7 Sun=1..Sat=7  => js = raw - 1
 */
function weekdayCandidates(raw: unknown): number[] {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return [];
  if (raw >= 0 && raw <= 6) return [raw];

  if (raw >= 1 && raw <= 7) {
    const mon1 = raw % 7; // 7 -> 0 (Sun)
    const sun1 = raw - 1; // 1 -> 0 (Sun)
    return Array.from(new Set([mon1, sun1])).filter((n) => n >= 0 && n <= 6);
  }

  return [];
}

// Narrowed types from your generated Database types
type ShopsRow = Database["public"]["Tables"]["shops"]["Row"];
type ShopPick = Pick<
  ShopsRow,
  "id" | "slug" | "timezone" | "accepts_online_booking"
>;

type ShopHoursRow = Database["public"]["Tables"]["shop_hours"]["Row"];
type HoursPick = Pick<ShopHoursRow, "weekday" | "open_time" | "close_time">;

type TimeOffRow = Database["public"]["Tables"]["shop_time_off"]["Row"];
type TimeOffPick = Pick<TimeOffRow, "starts_at" | "ends_at">;

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type BookingPick = Pick<BookingRow, "starts_at" | "ends_at" | "status">;

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { searchParams } = new URL(req.url);

    const slug = searchParams.get("shop") || "";
    const startYMD = searchParams.get("start") || "";
    const endYMD = searchParams.get("end") || "";
    const slotMins = Math.max(5, Math.min(180, Number(searchParams.get("slotMins") || 30)));

    if (!slug || !startYMD || !endYMD) {
      return NextResponse.json(
        { error: "Missing required params: shop, start, end" },
        { status: 400 },
      );
    }

    // 1) Load shop config
    const shopRes = await supabase
      .from("shops")
      .select("id, slug, timezone, accepts_online_booking")
      .eq("slug", slug)
      .maybeSingle();

    const shop = shopRes.data as ShopPick | null;
    if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

    const tz = shop.timezone || "UTC";

    if (!shop.accepts_online_booking) {
      return NextResponse.json({ slots: [], tz, disabled: true });
    }

    // Defaults
    const MIN_NOTICE_MIN = 120; // 2 hours
    const MAX_LEAD_DAYS = 30;   // 30 days
    const now = new Date();
    const maxLeadUntil = addMinutes(now, MAX_LEAD_DAYS * 24 * 60);

    // 2) Weekly hours
    const hoursRes = await supabase
      .from("shop_hours")
      .select("weekday, open_time, close_time")
      .eq("shop_id", shop.id);

    const hours = (hoursRes.data ?? []) as HoursPick[];

    // 3) Time-off within window (use "ends_at >= windowStart" and "starts_at <= windowEnd")
    const s = parseYMD(startYMD);
    const e = parseYMD(endYMD);

    const windowStartUtc = makeZonedDate(tz, s.y, s.m, s.d, 0, 0);
    const windowEndUtc = addMinutes(makeZonedDate(tz, e.y, e.m, e.d, 23, 59), 1);

    const timeOffRes = await supabase
      .from("shop_time_off")
      .select("starts_at, ends_at")
      .eq("shop_id", shop.id)
      .gte("ends_at", windowStartUtc.toISOString())
      .lte("starts_at", windowEndUtc.toISOString());

    const timeOff = (timeOffRes.data ?? []) as TimeOffPick[];

    // 4) Existing bookings within the window
    const bookingsRes = await supabase
      .from("bookings")
      .select("starts_at, ends_at, status")
      .eq("shop_id", shop.id)
      .gte("ends_at", windowStartUtc.toISOString())
      .lte("starts_at", windowEndUtc.toISOString());

    const bookings = (bookingsRes.data ?? []) as BookingPick[];

    const offWindows = timeOff.map((t) => ({
      start: new Date(t.starts_at),
      end: new Date(t.ends_at),
    }));

    const bookingWindows = bookings
      .filter((b) => b.status === "pending" || b.status === "confirmed")
      .map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) }));

    const slots: { start: string; end: string }[] = [];

    for (const day of iterateDays(startYMD, endYMD)) {
      // ✅ FIX: weekday computed for the LOCAL day in the shop timezone
      const localWeekday = weekdayForLocalYMD(tz, day.y, day.m, day.d);

      // ✅ FIX: support weekday encoding differences
      const dayHours = hours.filter((h) => {
        const cands = weekdayCandidates(h.weekday);
        return cands.includes(localWeekday);
      });

      if (dayHours.length === 0) continue;

      for (const h of dayHours) {
        const o = parseHm(h.open_time);
        const c = parseHm(h.close_time);
        if (!o || !c) continue;

        const open = makeZonedDate(tz, day.y, day.m, day.d, o.h, o.m);
        const close = makeZonedDate(tz, day.y, day.m, day.d, c.h, c.m);

        // ignore overnight for now
        if (close <= open) continue;

        for (
          let sdt = new Date(open);
          addMinutes(sdt, slotMins) <= close;
          sdt = addMinutes(sdt, slotMins)
        ) {
          const edt = addMinutes(sdt, slotMins);

          // min notice & max lead
          if (sdt < addMinutes(now, MIN_NOTICE_MIN)) continue;
          if (sdt > maxLeadUntil) continue;

          const isBlocked =
            offWindows.some((w) => overlaps(sdt, edt, w.start, w.end)) ||
            bookingWindows.some((w) => overlaps(sdt, edt, w.start, w.end));

          if (isBlocked) continue;

          slots.push({ start: sdt.toISOString(), end: edt.toISOString() });
        }
      }
    }

    return NextResponse.json({ tz, slots });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to compute availability";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}