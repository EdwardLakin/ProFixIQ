"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  RefreshCw,
  ShieldAlert,
  Truck,
  Wrench,
} from "lucide-react";
import { toFleetInternalHref } from "@/features/fleet/lib/fleetProductRouting";

type CalendarEventType =
  | "pm_due"
  | "pm_forecast"
  | "service_request"
  | "inspection"
  | "shop_service";

type CalendarEvent = {
  id: string;
  fleetId: string;
  fleetName: string;
  vehicleId: string;
  unitLabel: string;
  vehicleDescription: string;
  date: string | null;
  endDate: string | null;
  type: CalendarEventType;
  state: string;
  title: string;
  detail: string;
  href: string;
};

type CalendarPayload = {
  fleets: Array<{ id: string; name: string }>;
  summary: {
    due: number;
    planned: number;
    inspections: number;
    unscheduled: number;
  };
  events: CalendarEvent[];
};

const panel =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-[var(--theme-shadow-soft)]";

const EVENT_META: Record<
  CalendarEventType,
  { label: string; icon: typeof Wrench; className: string; dot: string }
> = {
  pm_due: {
    label: "PM due",
    icon: ShieldAlert,
    className:
      "border-amber-400/30 bg-amber-400/10 text-amber-800 dark:text-amber-200",
    dot: "bg-amber-400",
  },
  pm_forecast: {
    label: "PM forecast",
    icon: CalendarClock,
    className: "border-sky-400/25 bg-sky-400/10 text-sky-800 dark:text-sky-200",
    dot: "bg-sky-400",
  },
  service_request: {
    label: "Fleet request",
    icon: ClipboardCheck,
    className:
      "border-violet-400/25 bg-violet-400/10 text-violet-800 dark:text-violet-200",
    dot: "bg-violet-400",
  },
  inspection: {
    label: "Inspection",
    icon: ClipboardCheck,
    className:
      "border-emerald-400/25 bg-emerald-400/10 text-emerald-800 dark:text-emerald-200",
    dot: "bg-emerald-400",
  },
  shop_service: {
    label: "Shop service",
    icon: Wrench,
    className:
      "border-blue-400/25 bg-blue-400/10 text-blue-800 dark:text-blue-200",
    dot: "bg-blue-400",
  },
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function localIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function moveMonth(date: Date, amount: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1),
  );
}

function monthGridDays(month: Date): Date[] {
  const start = monthStart(month);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date;
  });
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function EventCard({
  event,
  compact = false,
  internalRoutes,
}: {
  event: CalendarEvent;
  compact?: boolean;
  internalRoutes: boolean;
}) {
  const meta = EVENT_META[event.type];
  const Icon = meta.icon;
  const href = internalRoutes
    ? (toFleetInternalHref(event.href) ?? event.href)
    : event.href;
  const selectedHref = `${href}${href.includes("?") ? "&" : "?"}fleetId=${encodeURIComponent(event.fleetId)}`;
  return (
    <Link
      href={selectedHref}
      title={`${event.unitLabel}: ${event.title}`}
      className={`block rounded-lg border transition hover:-translate-y-0.5 hover:shadow-sm ${meta.className} ${
        compact ? "px-2 py-1" : "p-3"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <div
            className={`${compact ? "truncate text-[10px]" : "text-xs"} font-semibold`}
          >
            {event.unitLabel} · {event.title}
          </div>
          {!compact ? (
            <>
              <div className="mt-1 text-[11px] opacity-80">{event.detail}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide opacity-70">
                <span>{meta.label}</span>
                <span>{event.fleetName}</span>
                <span>{event.state.replaceAll("_", " ")}</span>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export default function FleetMaintenanceCalendar({
  initialFleetId,
}: {
  initialFleetId?: string | null;
}) {
  const pathname = usePathname();
  const internalRoutes = pathname.startsWith("/portal/fleet");
  const [payload, setPayload] = useState<CalendarPayload | null>(null);
  const [fleetId, setFleetId] = useState(initialFleetId ?? "all");
  const [type, setType] = useState<CalendarEventType | "all">("all");
  const [month, setMonth] = useState(() =>
    monthStart(new Date(`${localIsoDate()}T00:00:00Z`)),
  );
  const [selectedDate, setSelectedDate] = useState(localIsoDate);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fleetId !== "all") params.set("fleetId", fleetId);
      const query = params.size ? `?${params.toString()}` : "";
      const response = await fetch(`/api/fleet/calendar${query}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as
        | CalendarPayload
        | { error?: string };
      if (!response.ok || !("events" in body)) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Unable to load calendar",
        );
      }
      setPayload(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load calendar",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Fleet selection owns the server-side scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetId]);

  const filteredEvents = useMemo(
    () =>
      (payload?.events ?? []).filter(
        (event) => type === "all" || event.type === type,
      ),
    [payload?.events, type],
  );
  const eventsByDate = useMemo(() => {
    const result = new Map<string, CalendarEvent[]>();
    for (const event of filteredEvents) {
      if (!event.date) continue;
      const current = result.get(event.date) ?? [];
      current.push(event);
      result.set(event.date, current);
    }
    return result;
  }, [filteredEvents]);
  const days = useMemo(() => monthGridDays(month), [month]);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const unscheduled = filteredEvents.filter((event) => !event.date);
  const upcoming = filteredEvents
    .filter((event) => event.date && event.date >= localIsoDate())
    .slice(0, 8);

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-6 text-[color:var(--theme-text-primary)]">
      <header className={`${panel} p-5`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-500 dark:text-sky-300">
              Maintenance planning
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
              Maintenance Calendar
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[color:var(--theme-text-secondary)]">
              PM forecasts, service requests, inspections and connected Shop
              appointments—planned around asset availability.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {payload && (payload.fleets.length > 1 || fleetId !== "all") ? (
              <select
                value={fleetId}
                onChange={(event) => setFleetId(event.target.value)}
                className="min-h-10 rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-xs"
              >
                {!initialFleetId ? (
                  <option value="all">All fleets</option>
                ) : null}
                {payload.fleets.map((fleet) => (
                  <option key={fleet.id} value={fleet.id}>
                    {fleet.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            <Link
              href={`${internalRoutes ? "/portal/fleet/maintenance" : "/maintenance"}${fleetId !== "all" ? `?fleetId=${encodeURIComponent(fleetId)}` : ""}`}
              className="inline-flex min-h-10 items-center rounded-xl bg-sky-400 px-4 py-2 text-xs font-semibold text-slate-950"
            >
              Open PM command
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              ["PM decisions", payload?.summary.due ?? 0, ShieldAlert],
              ["Planned service", payload?.summary.planned ?? 0, Wrench],
              [
                "Inspections",
                payload?.summary.inspections ?? 0,
                ClipboardCheck,
              ],
              [
                "Needs a date",
                payload?.summary.unscheduled ?? 0,
                CalendarClock,
              ],
            ] as const
          ).map(([label, value, Icon]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-[color:var(--theme-border-soft)] p-3"
            >
              <Icon
                className="h-4 w-4 text-sky-500 dark:text-sky-300"
                aria-hidden="true"
              />
              <div className="mt-2 text-2xl font-semibold">{String(value)}</div>
              <div className="text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                {String(label)}
              </div>
            </div>
          ))}
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-700 dark:text-red-200"
        >
          {error}
        </div>
      ) : null}

      <section className={`${panel} p-4`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth((current) => moveMonth(current, -1))}
              className="grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--theme-border-soft)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const today = localIsoDate();
                setMonth(monthStart(new Date(`${today}T00:00:00Z`)));
                setSelectedDate(today);
              }}
              className="min-h-10 rounded-xl border border-[color:var(--theme-border-soft)] px-4 text-sm font-semibold"
            >
              {new Intl.DateTimeFormat(undefined, {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(month)}
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth((current) => moveMonth(current, 1))}
              className="grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--theme-border-soft)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(
              [
                "all",
                "pm_due",
                "pm_forecast",
                "service_request",
                "inspection",
                "shop_service",
              ] as const
            ).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={
                  type === value
                    ? "shrink-0 rounded-full bg-sky-400 px-3 py-1.5 text-[11px] font-semibold text-slate-950"
                    : "shrink-0 rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-[11px] font-semibold"
                }
              >
                {value === "all" ? "All events" : EVENT_META[value].label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 hidden md:block">
          <div className="grid grid-cols-7 border-b border-l border-[color:var(--theme-border-soft)]">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="border-r border-t border-[color:var(--theme-border-soft)] px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[color:var(--theme-text-muted)]"
              >
                {day}
              </div>
            ))}
            {days.map((day) => {
              const key = isoDate(day);
              const dayEvents = eventsByDate.get(key) ?? [];
              const inMonth = day.getUTCMonth() === month.getUTCMonth();
              const selected = key === selectedDate;
              return (
                <div
                  key={key}
                  className={`min-h-28 border-r border-t border-[color:var(--theme-border-soft)] p-2 text-left align-top transition hover:bg-sky-400/[0.05] ${
                    selected
                      ? "bg-sky-400/[0.08] ring-1 ring-inset ring-sky-400/40"
                      : ""
                  } ${inMonth ? "" : "opacity-40"}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDate(key)}
                    aria-label={`Show agenda for ${displayDate(key)}`}
                    className="grid h-7 w-7 place-items-center rounded-lg text-xs font-semibold hover:bg-sky-400/10"
                  >
                    {day.getUTCDate()}
                  </button>
                  <div className="mt-2 space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <div key={event.id}>
                        <EventCard
                          event={event}
                          compact
                          internalRoutes={internalRoutes}
                        />
                      </div>
                    ))}
                    {dayEvents.length > 3 ? (
                      <div className="px-1 text-[10px] text-[color:var(--theme-text-muted)]">
                        +{dayEvents.length - 3} more
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 md:hidden">
          <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Agenda date
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setMonth(
                  monthStart(new Date(`${event.target.value}T00:00:00Z`)),
                );
              }}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3"
            />
          </label>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
        <section className={`${panel} p-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">{displayDate(selectedDate)}</h2>
              <p className="text-xs text-[color:var(--theme-text-muted)]">
                Asset maintenance agenda
              </p>
            </div>
            <span className="rounded-full bg-[color:var(--theme-surface-subtle)] px-3 py-1 text-xs font-semibold">
              {selectedEvents.length} event
              {selectedEvents.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {selectedEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                internalRoutes={internalRoutes}
              />
            ))}
            {!selectedEvents.length ? (
              <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-6 text-center text-sm text-[color:var(--theme-text-secondary)]">
                No maintenance activity is planned for this date.
              </div>
            ) : null}
          </div>
        </section>

        <section className={`${panel} p-4`}>
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-sky-500 dark:text-sky-300" />
            <div>
              <h2 className="font-semibold">Next across the Fleet</h2>
              <p className="text-xs text-[color:var(--theme-text-muted)]">
                Upcoming asset commitments
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {upcoming.map((event) => (
              <div key={event.id}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                  {event.date ? displayDate(event.date) : "Needs a date"}
                </div>
                <EventCard event={event} internalRoutes={internalRoutes} />
              </div>
            ))}
            {!upcoming.length ? (
              <p className="text-sm text-[color:var(--theme-text-secondary)]">
                No upcoming events match this filter.
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {unscheduled.length ? (
        <section className={`${panel} p-4`}>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-amber-500 dark:text-amber-300" />
            <div>
              <h2 className="font-semibold">Needs a planning date</h2>
              <p className="text-xs text-[color:var(--theme-text-muted)]">
                Open Fleet requests remain visible until a date is chosen.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {unscheduled.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                internalRoutes={internalRoutes}
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
