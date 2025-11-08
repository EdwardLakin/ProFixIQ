// app/portal/appointments/WeeklyCalendar.tsx
"use client";

import { useMemo } from "react";
import type { Booking } from "./page";

type Props = {
  weekStart: Date;
  bookings: Booking[];
  onSelectDay: (iso: string) => void;
  onSelectBooking: (b: Booking) => void;
  loading?: boolean;
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

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
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const grouped = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      const k = b.starts_at.slice(0, 10);
      const arr = map.get(k) ?? [];
      arr.push(b);
      map.set(k, arr);
    }
    // sort each bucket by time
    map.forEach((arr) => {
      arr.sort(
        (a, b) =>
          +new Date(a.starts_at) - +new Date(b.starts_at)
      );
    });
    return map;
  }, [bookings]);

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const k = dayKey(d);
        const dayBookings = grouped.get(k) ?? [];
        const isToday = new Date().toISOString().slice(0, 10) === k;

        return (
          <div
            key={k}
            className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-2 flex flex-col gap-2 min-h-[120px]"
          >
            <button
              type="button"
              onClick={() => onSelectDay(k)}
              className="flex items-center justify-between text-xs text-neutral-200"
            >
              <span>
                {d.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              {isToday ? (
                <span className="rounded bg-orange-500/90 px-1.5 py-0.5 text-[0.65rem] font-medium text-black">
                  Today
                </span>
              ) : null}
            </button>
            <div className="flex-1 space-y-1">
              {loading && dayBookings.length === 0 ? (
                <div className="text-[0.65rem] text-neutral-500">
                  Loading…
                </div>
              ) : dayBookings.length === 0 ? (
                <div className="text-[0.65rem] text-neutral-500">
                  No appointments
                </div>
              ) : (
                dayBookings.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onSelectBooking(b)}
                    className="w-full rounded bg-orange-500/10 border border-orange-500/30 px-2 py-1 text-left text-[0.65rem] hover:bg-orange-500/20"
                  >
                    <div className="font-medium text-white/90">
                      {b.customer_name || "Customer"}
                    </div>
                    <div className="text-[0.6rem] text-neutral-300">
                      {new Date(b.starts_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" – "}
                      {new Date(b.ends_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}