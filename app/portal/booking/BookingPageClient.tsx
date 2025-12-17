"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Toaster, toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import Calendar from "@shared/components/ui/Calendar";
import LinkButton from "@shared/components/ui/LinkButton";

type DB = Database;

type Slot = { start: string; end: string };
type AvailabilityResponse = { tz: string; slots: Slot[]; disabled?: boolean };

type ShopOption = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  "id" | "name" | "slug" | "accepts_online_booking"
>;

type HourRow = { weekday: number; open_time: string; close_time: string };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];


const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toYMDLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function ymdInTz(date: Date, tz: string) {
  // YYYY-MM-DD as it appears in the shop timezone (prevents day-shift bugs)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

const fmtTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

function glassCard() {
  return "rounded-3xl border border-white/10 bg-black/30 backdrop-blur-md shadow-card";
}

function fieldBase() {
  return "rounded-xl border border-white/12 bg-black/55 px-3 py-2 text-sm text-white outline-none transition focus:ring-1";
}

function softDivider() {
  return "border-white/10";
}

export default function PortalBookingPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const search = useSearchParams();
  const router = useRouter();

  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [loading, setLoading] = useState(false);
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [shopSlug, setShopSlug] = useState<string>(search.get("shop") || "");
  const [tz, setTz] = useState<string>("UTC");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [hours, setHours] = useState<HourRow[]>([]);

  // Keep state in sync if the URL changes (back/forward, external nav, etc.)
  useEffect(() => {
    const urlShop = search.get("shop") || "";
    setShopSlug((prev) => (prev === urlShop ? prev : urlShop));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Load shops that accept online booking
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("id,name,slug,accepts_online_booking")
        .eq("accepts_online_booking", true)
        .order("name", { ascending: true });

      if (error) {
        console.error(error);
        toast.error("Failed to load shops.");
        return;
      }

      const list = (data ?? []) as ShopOption[];
      setShops(list);

      const urlShop = search.get("shop") || "";
      if (!urlShop && list.length > 0) {
        const first = list[0].slug as string;
        setShopSlug(first);
        setSelectedDate(null);
        router.replace(`/portal/booking?shop=${encodeURIComponent(first)}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // Visible month range (API expects YYYY-MM-DD strings)
  const range = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { start: toYMDLocal(first), end: toYMDLocal(last) };
  }, [month]);

  // Fetch shop hours for selected shop
  useEffect(() => {
    const shop = shops.find((s) => (s.slug as string) === shopSlug);
    if (!shop) return;

    (async () => {
      try {
        const res = await fetch(`/api/settings/hours?shopId=${shop.id}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setHours([]);
          return;
        }
        const j = await res.json();
        const raw: HourRow[] = Array.isArray(j?.hours) ? j.hours : [];

        const normalized = Array.from({ length: 7 }, (_, i) => {
          const found = raw.find((h) => h.weekday === i);
          const open = found?.open_time ?? "08:00";
          const close = found?.close_time ?? "17:00";
          return { weekday: i, open_time: open, close_time: close };
        });

        setHours(normalized);
      } catch {
        setHours([]);
      }
    })();
  }, [shops, shopSlug]);

  const closedWeekdays = useMemo(() => {
    const set = new Set<number>();
    hours.forEach((h) => {
      if (h.open_time === h.close_time) set.add(h.weekday);
    });
    return set;
  }, [hours]);

  const closedLabel = useMemo(() => {
    if (closedWeekdays.size === 0) return "";
    return Array.from(closedWeekdays)
      .sort()
      .map((d) => WEEKDAYS[d])
      .join(", ");
  }, [closedWeekdays]);

  // Fetch availability when shop/month changes
  useEffect(() => {
    if (!shopSlug) return;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/portal/availability?shop=${encodeURIComponent(
            shopSlug,
          )}&start=${range.start}&end=${range.end}&slotMins=30`,
          { cache: "no-store" },
        );

        if (!res.ok) throw new Error("Failed to load availability.");

        const data: AvailabilityResponse = await res.json();

        setTz(data.tz || "UTC");
        if (data.disabled) {
          toast.warning("This shop is not accepting online bookings.");
          setSlots([]);
        } else {
          setSlots(data.slots || []);
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to load availability.");
      } finally {
        setLoading(false);
      }
    })();
  }, [shopSlug, range.start, range.end]);

  // ✅ Group slots by SHOP-TZ day key (fixes “calendar won’t click”)
  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    (slots || []).forEach((s) => {
      const k = ymdInTz(new Date(s.start), tz);
      const arr = map.get(k) ?? [];
      arr.push(s);
      map.set(k, arr);
    });
    map.forEach((arr) =>
      arr.sort((a, b) => +new Date(a.start) - +new Date(b.start)),
    );
    return map;
  }, [slots, tz]);

  const selectedKey = useMemo(() => {
    if (!selectedDate) return null;
    return ymdInTz(selectedDate, tz);
  }, [selectedDate, tz]);

  const daySlots = useMemo(() => {
    if (!selectedKey) return [];
    return slotsByDay.get(selectedKey) ?? [];
  }, [selectedKey, slotsByDay]);

  async function book(startIso: string, endIso: string) {
    try {
      const res = await fetch("/api/portal/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopSlug,
          startsAt: startIso,
          endsAt: endIso,
          notes: "",
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Booking failed");

      toast.success("Appointment requested! We’ll email you when it’s confirmed.");
      // remove the selected slot from UI
      setSlots((prev) => prev.filter((s) => s.start !== startIso));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not book.";
      toast.error(msg);
    }
  }

  const disabledDate = (d: Date) => {
    if (closedWeekdays.has(d.getDay())) return true;

    // ✅ Match the same TZ day key we used for grouping
    const k = ymdInTz(d, tz);
    return !slotsByDay.has(k);
  };

  const isSelectedClosed =
    selectedDate && closedWeekdays.has(selectedDate.getDay());

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 text-white">
      <Toaster position="top-center" />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Book an appointment
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            Choose a shop, then pick a date and time.
          </p>
        </div>

        <div className={glassCard() + " flex flex-wrap items-center gap-2 px-3 py-2"}>
          <label className="text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400">
            Shop
          </label>

          <select
            value={shopSlug}
            onChange={(e) => {
              const slug = e.target.value;
              setShopSlug(slug);
              setSelectedDate(null);
              router.replace(`/portal/booking?shop=${encodeURIComponent(slug)}`);
            }}
            className={fieldBase()}
            style={{
              borderColor: "rgba(255,255,255,0.14)",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
            }}
          >
            {shops.map((s) => (
              <option key={s.id} value={s.slug as string}>
                {s.name}
              </option>
            ))}
          </select>

          <LinkButton href="/portal/history" variant="outline" size="sm">
            View history
          </LinkButton>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className={glassCard() + " p-3"}>
          <div
            className="rounded-2xl border p-2"
            style={{
              borderColor: "rgba(255,255,255,0.08)",
              background:
                "radial-gradient(circle at 20% 10%, rgba(197,122,74,0.10), transparent 55%), rgba(0,0,0,0.35)",
            }}
          >
            <Calendar
              className="shadow-inner"
              month={month}
              onMonthChange={setMonth}
              value={selectedDate}
              onChange={setSelectedDate}
              disabled={disabledDate}
            />
          </div>
        </div>

        <div className={glassCard() + " p-4"}>
          <div className={"mb-3 border-b pb-3 " + softDivider()}>
            <h2 className="font-semibold text-white">Available times</h2>
            <p className="mt-1 text-xs text-neutral-400">
              Times shown in <span className="font-medium">{tz}</span>.
              {closedLabel ? (
                <span className="mt-1 block text-[0.7rem] text-neutral-500">
                  Closed: {closedLabel}
                </span>
              ) : null}
            </p>
          </div>

          {!shopSlug ? (
            <p className="text-sm text-neutral-400">
              Select a shop to view availability.
            </p>
          ) : !selectedDate ? (
            <p className="text-sm text-neutral-400">
              Pick a date on the calendar to see times.
            </p>
          ) : loading ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : daySlots.length === 0 ? (
            isSelectedClosed ? (
              <p className="text-sm text-neutral-400">
                Shop is closed on this day.
              </p>
            ) : (
              <p className="text-sm text-neutral-400">
                Shop is closed or fully booked for this date.
              </p>
            )
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {daySlots.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => book(s.start, s.end)}
                    className="w-full rounded-xl border px-3 py-2 text-sm font-semibold transition active:scale-[0.99]"
                    style={{
                      borderColor: "rgba(197,122,74,0.55)",
                      color: "rgba(245, 225, 205, 0.95)",
                      background: "rgba(197,122,74,0.10)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget.style.background = "rgba(197,122,74,0.18)");
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget.style.background = "rgba(197,122,74,0.10)");
                    }}
                  >
                    {fmtTime(s.start, tz)} – {fmtTime(s.end, tz)}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedKey ? (
            <div className="mt-4 text-[0.7rem] text-neutral-500">
              Selected day:{" "}
              <span className="font-medium text-neutral-300">{selectedKey}</span>
            </div>
          ) : null}
        </div>
      </div>

      <p className="mt-6 text-xs text-neutral-500">
        * Your request is pending until confirmed by the shop.
      </p>

      <style jsx global>{`
        /* Light “copper focus” without using orange utility classes */
        select:focus,
        input:focus,
        textarea:focus,
        button:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
}