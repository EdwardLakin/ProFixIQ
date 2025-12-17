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
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const fmtTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export default function PortalBookingPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const search = useSearchParams();
  const router = useRouter();

  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const [loading, setLoading] = useState(false);
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [shopSlug, setShopSlug] = useState<string>(search.get("shop") || "");
  const [tz, setTz] = useState<string>("UTC");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [hours, setHours] = useState<HourRow[]>([]);

  // Keep state in sync if the URL changes
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
        setSelectedDate(undefined);
        router.replace(`/portal/booking?shop=${encodeURIComponent(first)}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // Visible month range
  const range = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { start: toYMD(first), end: toYMD(last) };
  }, [month]);

  // Fetch shop hours
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
        setSlots([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopSlug, range.start, range.end]);

  // Group slots by day
  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    (slots || []).forEach((s) => {
      const k = toYMD(new Date(s.start));
      const arr = map.get(k) ?? [];
      arr.push(s);
      map.set(k, arr);
    });
    map.forEach((arr) =>
      arr.sort((a, b) => +new Date(a.start) - +new Date(b.start)),
    );
    return map;
  }, [slots]);

  const daySlots = useMemo(() => {
    if (!selectedDate) return [];
    return slotsByDay.get(toYMD(selectedDate)) ?? [];
  }, [selectedDate, slotsByDay]);

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
      setSlots((prev) => prev.filter((s) => s.start !== startIso));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not book.";
      toast.error(msg);
    }
  }

  // ✅ IMPORTANT: don’t disable everything while loading / before slots arrive
  const disabledDate = (d: Date) => {
    if (closedWeekdays.has(d.getDay())) return true;
    if (loading) return false;
    if (slotsByDay.size === 0) return false; // allow picking a day even if none available
    return !slotsByDay.has(toYMD(d));
  };

  const isSelectedClosed =
    selectedDate && closedWeekdays.has(selectedDate.getDay());

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 text-white">
      <Toaster position="top-center" />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-300">
            Book an appointment
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            Choose a shop, then pick a date and time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
          <label className="text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400">
            Shop
          </label>
          <select
            value={shopSlug}
            onChange={(e) => {
              const slug = e.target.value;
              setShopSlug(slug);
              setSelectedDate(undefined);
              router.replace(`/portal/booking?shop=${encodeURIComponent(slug)}`);
            }}
            className="min-w-[200px] rounded-md border border-white/10 bg-black/60 px-2 py-1 text-sm text-white outline-none focus:border-white/20"
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
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur-md shadow-card">
          <Calendar
            className="shadow-inner"
            month={month}
            onMonthChange={setMonth}
            /* ✅ FIX: your Calendar wrapper likely wants selected/onSelect */
            value={selectedDate}
            onChange={setSelectedDate}
            disabled={disabledDate}
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-md shadow-card">
          <h2 className="mb-1 font-semibold text-white">Available times</h2>
          <p className="mb-3 text-xs text-neutral-400">
            Times shown in <span className="font-medium">{tz}</span>.
            {closedLabel && (
              <span className="mt-1 block text-[0.7rem] text-neutral-500">
                Closed: {closedLabel}
              </span>
            )}
          </p>

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
              <p className="text-sm text-neutral-400">Shop is closed on this day.</p>
            ) : (
              <p className="text-sm text-neutral-400">
                No available slots for this date.
              </p>
            )
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {daySlots.map((s, i) => (
                <li key={i}>
                  <button
                    onClick={() => book(s.start, s.end)}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-neutral-100 transition hover:bg-white/5"
                    style={{
                      boxShadow: "inset 0 0 0 1px rgba(197,122,74,0.25)",
                    }}
                  >
                    {fmtTime(s.start, tz)} – {fmtTime(s.end, tz)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-neutral-500">
        * Your request is pending until confirmed by the shop.
      </p>
    </div>
  );
}