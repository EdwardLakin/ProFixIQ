// app/portal/customer-appointments/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Toaster, toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import LinkButton from "@shared/components/ui/LinkButton";
import { Button } from "@shared/components/ui/Button";

type DB = Database;

type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type ShopRow = Pick<DB["public"]["Tables"]["shops"]["Row"], "id" | "slug">;

type PortalBooking = {
  id: string;
  shop_slug?: string | null;

  starts_at: string; // ISO
  ends_at: string; // ISO

  customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;

  notes?: string | null;
  status?: string | null; // pending, confirmed, cancelled...
};

type HourRow = { weekday: number; open_time: string; close_time: string };

type ApptType = "waiter" | "drop_off";

const COPPER = "#C57A4A";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function cardClass() {
  return "rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-card";
}

function softButtonClass(active: boolean) {
  return [
    "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
    active
      ? "border-white/12 bg-white/8 text-neutral-50"
      : "border-white/10 bg-black/30 text-neutral-200 hover:bg-white/6",
  ].join(" ");
}

function pillClass(status?: string | null) {
  const s = (status || "pending").toLowerCase();
  if (s === "confirmed")
    return "border-emerald-500/30 bg-emerald-900/15 text-emerald-200";
  if (s === "cancelled")
    return "border-red-500/30 bg-red-900/15 text-red-200";
  // pending/other: copper vibe, not orange
  return "border-white/12 bg-white/5 text-neutral-200";
}

function fmtRange(startsAtIso: string, endsAtIso: string) {
  const start = new Date(startsAtIso);
  const end = new Date(endsAtIso);

  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const startTime = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const endTime = end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return { date, time: `${startTime} – ${endTime}` };
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function parseHHMM(s: string): { hh: number; mm: number } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function buildLocalDateTime(dateYMD: string, timeHHMM: string): Date | null {
  // dateYMD: "YYYY-MM-DD", timeHHMM: "HH:MM" (local)
  const t = parseHHMM(timeHHMM);
  if (!t) return null;
  const [y, m, d] = dateYMD.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, t.hh, t.mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function plusMinutes(d: Date, mins: number) {
  return new Date(d.getTime() + mins * 60_000);
}

export default function PortalCustomerAppointmentsPage() {
  const supabase = createClientComponentClient<DB>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);

  const [shopSlug, setShopSlug] = useState<string>("");
  const [bookings, setBookings] = useState<PortalBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Booking UI
  const [hours, setHours] = useState<HourRow[]>([]);
  const [apptDate, setApptDate] = useState<string>(""); // YYYY-MM-DD
  const [apptTime, setApptTime] = useState<string>(""); // HH:MM
  const [apptType, setApptType] = useState<ApptType>("waiter");
  const [submitting, setSubmitting] = useState(false);

  // 1) Load authed customer row (by user_id)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr || !user) {
        toast.error("Please sign in to view appointments.");
        router.replace("/portal/auth/sign-in");
        return;
      }

      const { data: c, error: cErr } = await supabase
        .from("customers")
        .select("id,user_id,shop_id,first_name,last_name,email,phone")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cErr) {
        toast.error(cErr.message);
        setCustomer(null);
        setLoading(false);
        return;
      }

      setCustomer((c ?? null) as CustomerRow | null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  // 2) Resolve shop slug
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!customer?.shop_id) {
        setShopSlug("");
        return;
      }

      const { data, error } = await supabase
        .from("shops")
        .select("id,slug")
        .eq("id", customer.shop_id)
        .maybeSingle<ShopRow>();

      if (cancelled) return;

      if (error) {
        console.error(error);
        toast.error("Unable to load your shop.");
        setShopSlug("");
        return;
      }

      setShopSlug((data?.slug as string) || "");
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, customer?.shop_id]);

  // 3) Fetch bookings for this customer (via existing endpoint)
  useEffect(() => {
    if (!customer?.id) return;
    if (!shopSlug) return;

    (async () => {
      setLoadingBookings(true);
      try {
        const now = new Date();
        const start = isoDate(addDays(now, -180));
        const end = isoDate(addDays(now, 365));

        const res = await fetch(
          `/api/portal/bookings?shop=${encodeURIComponent(shopSlug)}&start=${encodeURIComponent(
            start,
          )}&end=${encodeURIComponent(end)}`,
          { cache: "no-store" },
        );

        if (!res.ok) throw new Error("Failed to load your appointments.");

        const j = (await res.json().catch(() => [])) as PortalBooking[];
        const all = Array.isArray(j) ? j : [];
        const mine = all.filter((b) => (b.customer_id ?? null) === customer.id);

        setBookings(mine);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load appointments.");
        setBookings([]);
      } finally {
        setLoadingBookings(false);
      }
    })();
  }, [customer?.id, shopSlug]);

  // 4) Fetch shop hours (for building hour-based time options)
  useEffect(() => {
    if (!customer?.shop_id) {
      setHours([]);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/settings/hours?shopId=${customer.shop_id}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setHours([]);
          return;
        }
        const j = (await res.json().catch(() => ({}))) as { hours?: HourRow[] };
        const raw = Array.isArray(j?.hours) ? j.hours : [];

        const normalized = Array.from({ length: 7 }, (_, weekday) => {
          const found = raw.find((h) => h.weekday === weekday);
          return {
            weekday,
            open_time: found?.open_time ?? "08:00",
            close_time: found?.close_time ?? "17:00",
          };
        });

        setHours(normalized);
      } catch {
        setHours([]);
      }
    })();
  }, [customer?.shop_id]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter(
        (b) =>
          +new Date(b.ends_at) >= now &&
          (b.status || "pending").toLowerCase() !== "cancelled",
      )
      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  }, [bookings]);

  const past = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter(
        (b) =>
          +new Date(b.ends_at) < now ||
          (b.status || "").toLowerCase() === "cancelled",
      )
      .sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
  }, [bookings]);

  async function cancelBooking(id: string) {
    if (!confirm("Cancel this appointment?")) return;

    try {
      const res = await fetch(`/api/portal/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });

      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j?.error || "Cancel failed");

      toast.success("Appointment cancelled.");
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Cancel failed.";
      toast.error(msg);
    }
  }

  const todayYMD = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }, []);

  const timeOptions = useMemo((): string[] => {
    if (!apptDate) return [];
    const dt = buildLocalDateTime(apptDate, "00:00");
    if (!dt) return [];

    const weekday = dt.getDay();
    const h = hours.find((x) => x.weekday === weekday);
    if (!h) return [];

    const open = parseHHMM(h.open_time);
    const close = parseHHMM(h.close_time);
    if (!open || !close) return [];

    // if open == close => closed
    if (open.hh === close.hh && open.mm === close.mm) return [];

    const startMinutes = open.hh * 60 + open.mm;
    const endMinutes = close.hh * 60 + close.mm;

    const out: string[] = [];
    // hour intervals (top of hour)
    // start at next full hour from open_time (or open_time if already on hour)
    let t = startMinutes;
    if (t % 60 !== 0) t = t + (60 - (t % 60));

    // last start time must allow +60 mins before close
    for (; t + 60 <= endMinutes; t += 60) {
      const hh = Math.floor(t / 60);
      const mm = t % 60;
      out.push(`${pad2(hh)}:${pad2(mm)}`);
    }
    return out;
  }, [apptDate, hours]);

  useEffect(() => {
    // Keep selected time valid
    if (!apptTime) return;
    if (timeOptions.includes(apptTime)) return;
    setApptTime("");
  }, [apptTime, timeOptions]);

  async function requestAppointment() {
    if (!shopSlug) {
      toast.error("No shop linked.");
      return;
    }
    if (!apptDate) {
      toast.error("Pick a date.");
      return;
    }
    if (!apptTime) {
      toast.error("Pick a time.");
      return;
    }
    const startLocal = buildLocalDateTime(apptDate, apptTime);
    if (!startLocal) {
      toast.error("Invalid date/time.");
      return;
    }

    // guard: date in past
    if (startLocal.getTime() < Date.now() - 60_000) {
      toast.error("Please pick a future time.");
      return;
    }

    const endLocal = plusMinutes(startLocal, 60);

    const startsAt = startLocal.toISOString();
    const endsAt = endLocal.toISOString();

    const typeLabel = apptType === "waiter" ? "Waiter" : "Drop off";

    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopSlug,
          startsAt,
          endsAt,
          // ✅ for now, store type in notes so it survives end-to-end
          notes: `Type: ${typeLabel}`,
        }),
      });

      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j?.error || "Booking failed");

      toast.success("Appointment requested! We’ll confirm it shortly.");
      setApptTime("");
      // optional: refresh list
      setBookings((prev) => prev);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not book.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl">
        <div className={cardClass() + " text-sm text-neutral-200"}>Loading your portal…</div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <div className={cardClass()}>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            My appointments
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            We couldn’t find your customer profile yet.
          </p>
          <div className="mt-4 flex gap-2">
            <LinkButton href="/portal/profile" variant="outline" size="sm">
              Go to profile
            </LinkButton>
            <LinkButton href="/portal/booking" size="sm">
              Book an appointment
            </LinkButton>
          </div>
        </div>
      </div>
    );
  }

  if (!shopSlug) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <div className={cardClass()}>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            My appointments
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Your portal account isn’t linked to a shop yet.
          </p>
          <div className="mt-4 flex gap-2">
            <LinkButton href="/portal/profile" variant="outline" size="sm">
              Go to profile
            </LinkButton>
            <LinkButton href="/portal/booking" size="sm">
              Book an appointment
            </LinkButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 text-white">
      <Toaster position="top-center" />

      <header className="space-y-1">
        <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
          My appointments
        </h1>
        <p className="text-xs text-neutral-400">Request a time, then manage upcoming visits.</p>
      </header>

      <div className="flex gap-2">
        <LinkButton href="/portal/history" variant="outline" size="sm">
          View service history
        </LinkButton>
      </div>

      {/* Request appointment (date + time select) */}
      <section className={cardClass()}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-neutral-100">Request an appointment</h2>
          <span
            className="text-[0.7rem] font-semibold uppercase tracking-[0.16em]"
            style={{ color: COPPER }}
          >
            Hourly slots
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-[0.7rem] uppercase tracking-[0.14em] text-neutral-400">
              Date
            </label>
            <input
              type="date"
              min={todayYMD}
              value={apptDate}
              onChange={(e) => setApptDate(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[0.7rem] uppercase tracking-[0.14em] text-neutral-400">
              Time
            </label>
            <select
              value={apptTime}
              onChange={(e) => setApptTime(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10"
              disabled={!apptDate || timeOptions.length === 0}
            >
              <option value="">
                {!apptDate
                  ? "Pick a date first"
                  : timeOptions.length === 0
                    ? "No times available"
                    : "Select a time"}
              </option>
              {timeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {apptDate ? (
              <div className="mt-1 text-[0.7rem] text-neutral-500">
                {(() => {
                  const dt = buildLocalDateTime(apptDate, "00:00");
                  const wd = dt ? WEEKDAYS[dt.getDay()] : "";
                  return wd ? `Hours based on ${wd}.` : "";
                })()}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-[0.7rem] uppercase tracking-[0.14em] text-neutral-400">
            Appointment type
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={softButtonClass(apptType === "waiter")}
              onClick={() => setApptType("waiter")}
            >
              Waiter
            </button>
            <button
              type="button"
              className={softButtonClass(apptType === "drop_off")}
              onClick={() => setApptType("drop_off")}
            >
              Drop off
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-500">
            Requests are pending until the shop confirms.
          </div>

          <button
            type="button"
            onClick={() => void requestAppointment()}
            disabled={submitting || !apptDate || !apptTime}
            className="inline-flex items-center justify-center rounded-xl border border-white/14 bg-black/40 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-white/8 disabled:opacity-60"
          >
            {submitting ? "Requesting…" : "Request"}
          </button>
        </div>
      </section>

      {/* Upcoming */}
      <section className={cardClass()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">
            Upcoming ({upcoming.length})
          </h2>
          {loadingBookings ? <span className="text-[0.75rem] text-neutral-400">Loading…</span> : null}
        </div>

        {loadingBookings ? (
          <p className="mt-3 text-sm text-neutral-400">Fetching your bookings…</p>
        ) : upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">No upcoming appointments.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {upcoming.map((b) => {
              const { date, time } = fmtRange(b.starts_at, b.ends_at);
              return (
                <li key={b.id} className="rounded-xl border border-white/10 bg-black/35 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-100">{date}</div>
                      <div className="mt-0.5 text-xs text-neutral-300">{time}</div>
                      {b.notes ? (
                        <div className="mt-2 text-xs text-neutral-400">{b.notes}</div>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-1 text-[0.7rem] uppercase tracking-[0.14em] " +
                          pillClass(b.status)
                        }
                      >
                        {b.status || "pending"}
                      </span>

                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => void cancelBooking(b.id)}
                        className="border-red-500/40 text-red-200 hover:bg-red-900/20"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Past */}
      <section className={cardClass()}>
        <h2 className="text-sm font-semibold text-neutral-100">Past ({past.length})</h2>

        {loadingBookings ? (
          <p className="mt-3 text-sm text-neutral-400">Loading…</p>
        ) : past.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">No past appointments.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {past.slice(0, 25).map((b) => {
              const { date, time } = fmtRange(b.starts_at, b.ends_at);
              return (
                <li key={b.id} className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-100">{date}</div>
                      <div className="mt-0.5 text-xs text-neutral-400">{time}</div>
                    </div>

                    <span
                      className={
                        "inline-flex items-center rounded-full border px-2 py-1 text-[0.7rem] uppercase tracking-[0.14em] " +
                        pillClass(b.status)
                      }
                    >
                      {b.status || "pending"}
                    </span>
                  </div>

                  {b.notes ? <div className="mt-2 text-xs text-neutral-500">{b.notes}</div> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-[0.75rem] text-neutral-500">
        Need to change a time? Cancel and request a new slot.
      </p>
    </div>
  );
}