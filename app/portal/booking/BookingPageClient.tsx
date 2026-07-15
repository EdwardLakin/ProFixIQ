"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
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

function dateFromSearch(value: string | null): Date | undefined {
  if (!value || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export default function PortalBookingPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const search = useSearchParams();
  const router = useRouter();

  const initialRequestedDate = dateFromSearch(search.get("requestedDate"));
  const [month, setMonth] = useState(() => initialRequestedDate ?? new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialRequestedDate);

  const [loading, setLoading] = useState(false);
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [shopSlug, setShopSlug] = useState<string>(search.get("shop") || "");
  const [tz, setTz] = useState<string>("UTC");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [hours, setHours] = useState<HourRow[]>([]);
  const [portalEmail, setPortalEmail] = useState("");
  const [portalName, setPortalName] = useState("");
  const [portalPhone, setPortalPhone] = useState("");
  const [portalSubmitting, setPortalSubmitting] = useState(false);
  const [portalMessage, setPortalMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const urlShop = search.get("shop") || "";
    setShopSlug((prev) => (prev === urlShop ? prev : urlShop));
    const requested = dateFromSearch(search.get("requestedDate"));
    if (requested) {
      setMonth(requested);
      setSelectedDate(requested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

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

  const range = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { start: toYMD(first), end: toYMD(last) };
  }, [month]);

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
      const res = await fetch("/api/portal/bookings", {
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

  const disabledDate = (d: Date) => {
    if (closedWeekdays.has(d.getDay())) return true;
    if (loading) return false;
    if (slotsByDay.size === 0) return false;
    return !slotsByDay.has(toYMD(d));
  };

  const isSelectedClosed =
    selectedDate && closedWeekdays.has(selectedDate.getDay());
  const selectedShop = shops.find((s) => (s.slug as string) === shopSlug);
  const hasExplicitShopSelection = Boolean(shopSlug);
  const isShopSelectionUnavailable = hasExplicitShopSelection && !selectedShop;

  async function requestPortalAccess(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPortalMessage(null);

    if (!selectedShop) {
      setPortalMessage({
        type: "error",
        text: "This shop is currently unavailable.",
      });
      return;
    }

    setPortalSubmitting(true);
    try {
      const res = await fetch("/api/portal/qr/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopSlug: selectedShop.slug,
          email: portalEmail,
          ...(portalName.trim() ? { name: portalName.trim() } : {}),
          ...(portalPhone.trim() ? { phone: portalPhone.trim() } : {}),
          next: "/portal",
        }),
      });

      if (!res.ok) {
        throw new Error("Could not send portal access link.");
      }

      setPortalMessage({
        type: "success",
        text: "If the email is valid, we sent a portal access link.",
      });
    } catch (error) {
      console.error(error);
      setPortalMessage({
        type: "error",
        text: "We couldn’t send a portal link right now. Please try again.",
      });
    } finally {
      setPortalSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 text-[color:var(--theme-text-primary)]">
      <Toaster position="top-center" />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="text-lg tracking-[0.18em] text-[var(--accent-copper-light)]"
            style={{ fontFamily: "var(--font-blackops), system-ui, sans-serif" }}
          >
            Book service appointment
          </h1>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Guided flow: Shop → Date → Time → Confirmation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[rgba(197,122,74,0.22)] bg-[var(--theme-gradient-panel)] px-3 py-3 backdrop-blur-xl">
          <label className="text-[0.7rem] uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
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
            className="min-w-[200px] rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm text-[color:var(--theme-text-primary)] outline-none"
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

      <div className="mb-6 rounded-2xl border border-[rgba(197,122,74,0.22)] bg-[var(--theme-gradient-panel)] p-4 backdrop-blur-xl">
        <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Send me my portal link</h2>
        <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
          Need to book or view service? Send yourself a secure portal link first.
        </p>
        <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={requestPortalAccess}>
          <input
            type="email"
            required
            value={portalEmail}
            onChange={(e) => setPortalEmail(e.target.value)}
            placeholder="Email *"
            className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none"
          />
          <input
            type="text"
            value={portalName}
            onChange={(e) => setPortalName(e.target.value)}
            placeholder="Name (optional)"
            className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none"
          />
          <input
            type="tel"
            value={portalPhone}
            onChange={(e) => setPortalPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none"
          />
          <button
            type="submit"
            disabled={portalSubmitting || isShopSelectionUnavailable}
            className="rounded-md border border-[rgba(193,102,59,0.38)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm font-medium text-[color:var(--theme-text-primary)] transition hover:border-[rgba(193,102,59,0.45)] hover:bg-[rgba(193,102,59,0.10)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {portalSubmitting ? "Sending..." : "Send portal link"}
          </button>
        </form>
        {portalMessage && (
          <p
            className={`mt-2 text-xs ${
              portalMessage.type === "success" ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {portalMessage.text}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 backdrop-blur-xl">
          <Calendar
            className="shadow-inner"
            month={month}
            onMonthChange={setMonth}
            value={selectedDate}
            onChange={setSelectedDate}
            disabled={disabledDate}
          />
        </div>

        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 backdrop-blur-xl">
          <h2 className="mb-1 font-semibold text-[color:var(--theme-text-primary)]">Step 3 • Select time</h2>
          <p className="mb-3 text-xs text-[color:var(--theme-text-secondary)]">
            Times shown in <span className="font-medium">{tz}</span>.
            {closedLabel && (
              <span className="mt-1 block text-[0.7rem] text-[color:var(--theme-text-muted)]">
                Closed: {closedLabel}
              </span>
            )}
          </p>

          {!shopSlug ? (
            <p className="text-sm text-[color:var(--theme-text-secondary)]">
              Select a shop in Step 1 to load availability.
            </p>
          ) : !selectedDate ? (
            <p className="text-sm text-[color:var(--theme-text-secondary)]">
              Pick a date in Step 2 to see time slots.
            </p>
          ) : loading ? (
            <p className="text-sm text-[color:var(--theme-text-secondary)]">Loading available times…</p>
          ) : daySlots.length === 0 ? (
            isSelectedClosed ? (
              <p className="text-sm text-[color:var(--theme-text-secondary)]">Shop is closed on this day.</p>
            ) : (
              <p className="text-sm text-[color:var(--theme-text-secondary)]">
                No available slots on this date. Try another day.
              </p>
            )
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {daySlots.map((s, i) => (
                <li key={i}>
                  <button
                    onClick={() => book(s.start, s.end)}
                    className="w-full rounded-xl border border-[rgba(193,102,59,0.38)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm font-medium text-[color:var(--theme-text-primary)] transition hover:border-[rgba(193,102,59,0.45)] hover:bg-[rgba(193,102,59,0.10)]"
                    aria-label="Book this time slot"
                    style={{
                      boxShadow: "inset 0 0 0 1px rgba(193,102,59,0.12)",
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

      <p className="mt-6 text-xs text-[color:var(--theme-text-muted)]">
        * Your request is pending until confirmed by the shop.
      </p>
    </div>
  );
}
