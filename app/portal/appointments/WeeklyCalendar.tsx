// app/portal/appointments/WeeklyCalendar.tsx
"use client";

import { useMemo } from "react";
import type { Booking } from "./page";
import { Button } from "@shared/components/ui/Button";

type Props = {
  weekStart: Date;
  bookings: Booking[];
  onSelectDay: (iso: string) => void;
  onSelectBooking: (b: Booking) => void;
  loading?: boolean;
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

// Local date key (prevents UTC drift that can happen with toISOString())
function dayKeyLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function timeLabel(startsAtIso: string, endsAtIso: string) {
  const start = new Date(startsAtIso);
  const end = new Date(endsAtIso);
  const s = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const e = end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${s} – ${e}`;
}

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function displayCustomerName(b: Booking): string {
  // keep compatibility with any older/extra fields without ts-ignore
  const rec = b as unknown as Record<string, unknown>;
  const fromExtra =
    safeStr(rec["customer_full_name"]) ||
    safeStr(rec["customerName"]) ||
    safeStr(rec["name"]);

  return safeStr(b.customer_name) || fromExtra || "Customer";
}

function statusPill(status?: string | null) {
  const s = (status || "pending").toLowerCase();
  if (s === "confirmed") return "border-emerald-500/30 bg-emerald-900/15 text-emerald-200";
  if (s === "cancelled") return "border-red-500/30 bg-red-900/15 text-red-200";
  return "border-orange-500/30 bg-orange-900/10 text-orange-200";
}

function bookingCardStyle(status?: string | null) {
  const s = (status || "pending").toLowerCase();
  if (s === "cancelled") {
    return "border-white/10 bg-black/35 text-neutral-300 hover:bg-black/40";
  }
  if (s === "confirmed") {
    return "border-emerald-400/25 bg-emerald-500/10 hover:bg-emerald-500/15";
  }
  // pending
  return "border-orange-400/30 bg-orange-500/10 hover:bg-orange-500/15";
}

export default function WeeklyCalendar({
  weekStart,
  bookings,
  onSelectDay,
  onSelectBooking,
  loading = false,
}: Props) {
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const grouped = useMemo(() => {
    const map = new Map<string, Booking[]>();

    for (const b of bookings) {
      const d = new Date(b.starts_at);
      const k = dayKeyLocal(d);
      const arr = map.get(k) ?? [];
      arr.push(b);
      map.set(k, arr);
    }

    map.forEach((arr) => {
      arr.sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    });

    return map;
  }, [bookings]);

  const todayKey = dayKeyLocal(new Date());

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
      {days.map((d) => {
        const k = dayKeyLocal(d);
        const dayBookings = grouped.get(k) ?? [];
        const isToday = todayKey === k;

        const activeCount = dayBookings.filter(
          (b) => (b.status || "pending").toLowerCase() !== "cancelled",
        ).length;

        return (
          <div
            key={k}
            className="flex min-h-[160px] flex-col gap-2 rounded-2xl border border-white/10 bg-black/35 p-3 text-xs text-neutral-100 shadow-card backdrop-blur-md overflow-hidden"
          >
            {/* Day header */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={isToday ? "default" : "outline"}
                size="sm"
                onClick={() => onSelectDay(k)}
                className="flex w-full items-center justify-between rounded-xl px-2 py-1 text-[0.75rem]"
              >
                <span className="font-medium">
                  {d.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>

                <span className="flex items-center gap-2">
                  {isToday ? (
                    <span className="rounded-full bg-black/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em]">
                      Today
                    </span>
                  ) : null}

                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.65rem] text-neutral-200">
                    {activeCount}
                  </span>
                </span>
              </Button>
            </div>

            {/* Appointments list */}
            <div className="flex-1 space-y-1.5">
              {loading && dayBookings.length === 0 ? (
                <div className="space-y-2">
                  <div className="h-9 w-full animate-pulse rounded-xl border border-white/10 bg-white/5" />
                  <div className="h-9 w-full animate-pulse rounded-xl border border-white/10 bg-white/5" />
                </div>
              ) : dayBookings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/25 px-2 py-2 text-[0.65rem] text-neutral-500">
                  No appointments
                </div>
              ) : (
                dayBookings.map((b) => {
                  const s = (b.status || "pending").toLowerCase();
                  const isCancelled = s === "cancelled";

                  return (
                    <Button
                      key={b.id}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectBooking(b)}
                      className={
                        "flex w-full flex-col items-start gap-1 rounded-xl border px-2 py-2 text-left text-[0.7rem] " +
                        bookingCardStyle(b.status)
                      }
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <div className={"truncate font-semibold " + (isCancelled ? "text-neutral-200/80 line-through" : "text-white")}>
                          {displayCustomerName(b)}
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.14em] " +
                              statusPill(b.status)
                            }
                          >
                            {b.status || "pending"}
                          </span>

                          <span className={"whitespace-nowrap text-[0.6rem] " + (isCancelled ? "text-neutral-400" : "text-neutral-200")}>
                            {timeLabel(b.starts_at, b.ends_at)}
                          </span>
                        </div>
                      </div>

                      {b.notes ? (
                        <div className="line-clamp-2 text-[0.62rem] text-neutral-200/80">
                          {b.notes}
                        </div>
                      ) : null}
                    </Button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}