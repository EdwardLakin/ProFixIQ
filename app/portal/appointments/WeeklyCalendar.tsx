"use client";

import React, { useMemo } from "react";

type Booking = {
  id: string;
  starts_at: string;
  ends_at: string;
  customer_name?: string | null;
  status?: string | null;
};

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function WeeklyCalendar({
  weekStart,
  bookings,
  onSelectDay,
  onSelectBooking,
  loading,
}: {
  weekStart: Date;
  bookings: Booking[];
  onSelectDay: (dayIso: string) => void;
  onSelectBooking: (b: Booking) => void;
  loading: boolean;
}) {
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
    map.forEach((arr, _k) => {
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
            className={`flex min-h-[140px] flex-col rounded-lg border ${
              isToday
                ? "border-orange-500 bg-orange-500/5"
                : "border-neutral-800 bg-neutral-900"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectDay(k)}
              className="flex items-center justify-between px-2 py-1 text-left"
            >
              <div>
                <div className="text-xs text-neutral-300">
                  {d.toLocaleDateString(undefined, {
                    weekday: "short",
                  })}
                </div>
                <div className="text-sm font-semibold text-white">
                  {d.getDate()}
                </div>
              </div>
              <span className="text-[10px] text-neutral-500">
                {dayBookings.length} appt
                {dayBookings.length === 1 ? "" : "s"}
              </span>
            </button>
            <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
              {loading ? (
                <div className="text-[10px] text-neutral-500">Loading…</div>
              ) : dayBookings.length === 0 ? (
                <div className="text-[10px] text-neutral-500">No appts</div>
              ) : (
                dayBookings.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onSelectBooking(b)}
                    className="w-full rounded border border-neutral-700 bg-neutral-950 px-1 py-1 text-left hover:border-orange-500"
                  >
                    <div className="text-[10px] text-neutral-400">
                      {new Date(b.starts_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      –{" "}
                      {new Date(b.ends_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="truncate text-[11px] text-white">
                      {b.customer_name || "Customer"}
                    </div>
                    {b.status ? (
                      <div className="text-[9px] text-neutral-500">
                        {b.status}
                      </div>
                    ) : null}
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