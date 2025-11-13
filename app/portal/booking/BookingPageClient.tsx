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

// Only the columns we actually fetch/use
type ShopOption = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  "id" | "name" | "slug" | "accepts_online_booking"
>;

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Format a Date in a specific IANA timezone
const fmtTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export default function PortalBookingPage() {
  const supabase = createClientComponentClient<DB>();

  const search = useSearchParams();
  const router = useRouter();

  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [loading, setLoading] = useState(false);
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [shopSlug, setShopSlug] = useState<string>(search.get("shop") || "");
  const [tz, setTz] = useState<string>("UTC");
  const [slots, setSlots] = useState<Slot[]>([]);

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

      if (!shopSlug && list.length > 0) {
        const first = list[0].slug as string;
        setShopSlug(first);
        router.replace(`/portal/booking?shop=${encodeURIComponent(first)}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute visible month range
  const range = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { start: toYMD(first), end: toYMD(last) };
  }, [month]);

  // Fetch availability whenever shop or month changes
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

        if (data.disabled) {
          toast.warning("This shop is not accepting online bookings.");
          setSlots([]);
          setTz(data.tz || "UTC");
        } else {
          setSlots(data.slots || []);
          setTz(data.tz || "UTC");
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to load availability.");
      } finally {
        setLoading(false);
      }
    })();
  }, [shopSlug, range.start, range.end]);

  // Group slots by day using local Y-M-D
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

  // Slots for the selected date
  const daySlots = useMemo(() => {
    if (!selectedDate) return [];
    const k = toYMD(selectedDate);
    return slotsByDay.get(k) ?? [];
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

      toast.success(
        "Appointment requested! We’ll email you when it’s confirmed.",
      );
      setSlots((prev) => prev.filter((s) => s.start !== startIso));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not book.";
      toast.error(msg);
    }
  }

  const disabledDate = (d: Date) => !slotsByDay.has(toYMD(d));

  return (
    <div className="mx-auto max-w-5xl">
      <Toaster position="top-center" />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-blackops text-orange-400">
          Book an Appointment
        </h1>

        <div className="flex items-center gap-3">
          <label className="text-sm text-neutral-400">Shop</label>
          <select
            value={shopSlug}
            onChange={(e) => {
              const slug = e.target.value;
              setShopSlug(slug);
              setSelectedDate(null);
              router.replace(`/portal/booking?shop=${encodeURIComponent(slug)}`);
            }}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
          >
            {shops.map((s) => (
              <option key={s.id} value={s.slug as string}>
                {s.name}
              </option>
            ))}
          </select>

          <LinkButton href="/portal/history" variant="outline" size="sm">
            View History
          </LinkButton>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Calendar
          className="shadow-inner"
          month={month}
          onMonthChange={setMonth}
          value={selectedDate}
          onChange={setSelectedDate}
          disabled={disabledDate}
        />

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="mb-1 font-semibold text-white">Available Times</h2>
          <p className="mb-3 text-xs text-neutral-400">
            Times shown in <span className="font-medium">{tz}</span>.
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
            <p className="text-sm text-neutral-400">
              No times available for this date.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {daySlots.map((s, i) => (
                <li key={i}>
                  <button
                    onClick={() => book(s.start, s.end)}
                    className="w-full rounded-lg border border-orange-600 px-3 py-2 text-sm text-orange-400 transition hover:bg-orange-600 hover:text-black"
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
        * Times reflect shop hours and blackout dates. Your request is pending
        until confirmed by the shop.
      </p>
    </div>
  );
}