import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

/** Build a Date in UTC that corresponds to local components in a given IANA tz. */
function makeZonedDate(tz: string, y: number, m: number, d: number, hh = 0, mm = 0) {
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
  const parts = Object.fromEntries(fmt.formatToParts(tentative).map(p => [p.type, p.value]));
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
    yield { utc: dt, y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }
}

const addMinutes = (date: Date, mins: number) => new Date(date.getTime() + mins * 60_000);
const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { searchParams } = new URL(req.url);

    const slug = searchParams.get("shop") || "";
    const startYMD = searchParams.get("start") || "";
    const endYMD = searchParams.get("end") || "";
    const slotMins = Math.max(5, Math.min(180, Number(searchParams.get("slotMins") || 30)));

    if (!slug || !startYMD || !endYMD) {
      return NextResponse.json({ error: "Missing required params: shop, start, end" }, { status: 400 });
    }

    // 1) Load shop config
    const shopRes = await supabase
      .from("shops")
      .select("id, slug, timezone, accepts_online_booking, min_notice_minutes, max_lead_days")
      .eq("slug", slug)
      .maybeSingle();

    const shop = shopRes.data;
    if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    if (!shop.accepts_online_booking) return NextResponse.json({ slots: [], tz: shop.timezone, disabled: true });

    const tz = shop.timezone || "UTC";
    const minNoticeMin = shop.min_notice_minutes ?? 120;
    const maxLeadDays = shop.max_lead_days ?? 30;

    const now = new Date();
    const maxLeadUntil = addMinutes(now, maxLeadDays * 24 * 60);

    // 2) Weekly hours
    const hoursRes = await supabase
      .from("shop_hours")
      .select("weekday, open_time, close_time")
      .eq("shop_id", shop.id);
    const hours = hoursRes.data ?? [];

    // 3) Time-off windows overlapping range
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
    const timeOff = timeOffRes.data ?? [];

    // 4) Bookings overlapping range
    const bookingsRes = await supabase
      .from("bookings")
      .select("starts_at, ends_at, status")
      .eq("shop_id", shop.id)
      .gte("ends_at", windowStartUtc.toISOString())
      .lte("starts_at", windowEndUtc.toISOString());
    const bookings = bookingsRes.data ?? [];

    const offWindows = timeOff.map(t => ({
      start: new Date(t.starts_at as string),
      end: new Date(t.ends_at as string),
    }));

    const bookingWindows = bookings
      .filter(b => b.status === "pending" || b.status === "confirmed")
      .map(b => ({ start: new Date(b.starts_at as string), end: new Date(b.ends_at as string) }));

    // Helper: weekday in shop tz (0–6)
    const weekdayInTz = (d: Date) => {
      const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(fmt.format(d));
    };

    const slots: { start: string; end: string }[] = [];

    for (const day of iterateDays(startYMD, endYMD)) {
      const localWeekday = weekdayInTz(day.utc);
      const dayHours = hours.filter(h => h.weekday === localWeekday);
      if (dayHours.length === 0) continue;

      for (const h of dayHours) {
        const [oh, om] = (h.open_time as string).split(":").map(Number);
        const [ch, cm] = (h.close_time as string).split(":").map(Number);

        const open = makeZonedDate(tz, day.y, day.m, day.d, oh, om);
        const close = makeZonedDate(tz, day.y, day.m, day.d, ch, cm);

        for (let sdt = new Date(open); addMinutes(sdt, slotMins) <= close; sdt = addMinutes(sdt, slotMins)) {
          const edt = addMinutes(sdt, slotMins);

          if (sdt < addMinutes(now, minNoticeMin)) continue; // min notice
          if (sdt > maxLeadUntil) continue; // max lead

          const isBlocked =
            offWindows.some(w => overlaps(sdt, edt, w.start, w.end)) ||
            bookingWindows.some(w => overlaps(sdt, edt, w.start, w.end));
          if (isBlocked) continue;

          slots.push({ start: sdt.toISOString(), end: edt.toISOString() });
        }
      }
    }

    return NextResponse.json({ tz, slots });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to compute availability" },
      { status: 500 },
    );
  }
}