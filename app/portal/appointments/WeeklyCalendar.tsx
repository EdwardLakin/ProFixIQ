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

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function displayCustomerName(b: Booking): string {
  // @ts-expect-error – optional extra field if you ever add it
  const fromExtra = b.customer_full_name as string | undefined;
  return b.customer_name || fromExtra || "Customer";
}

export default function WeeklyCalendar({
  weekStart,
  bookings,
  onSelectDay,
  onSelectBooking,
  loading = false,
}: Props) {
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      const k = b.starts_at.slice(0, 10);
      const arr = map.get(k) ?? [];
      arr.push(b);
      map.set(k, arr);
    }
    map.forEach((arr) => {
      arr.sort(
        (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
      );
    });
    return map;
  }, [bookings]);

  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
      {days.map((d) => {
        const k = dayKey(d);
        const dayBookings = grouped.get(k) ?? [];
        const isToday = todayKey === k;

        return (
          <div
            key={k}
            className="flex min-h-[140px] flex-col gap-2 rounded-2xl border border-white/10 bg-black/40 p-3 text-xs text-neutral-100 shadow-card backdrop-blur-md overflow-hidden"
          >
            {/* Day header */}
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
              {isToday && (
                <span className="rounded-full bg-black/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em]">
                  Today
                </span>
              )}
            </Button>

            {/* Appointments list */}
            <div className="flex-1 space-y-1.5">
              {loading && dayBookings.length === 0 ? (
                <div className="rounded-md border border-neutral-800 bg-neutral-900/60 px-2 py-2 text-[0.65rem] text-neutral-400">
                  Loading…
                </div>
              ) : dayBookings.length === 0 ? (
                <div className="rounded-md border border-dashed border-neutral-800 bg-neutral-950/40 px-2 py-2 text-[0.65rem] text-neutral-500">
                  No appointments
                </div>
              ) : (
                dayBookings.map((b) => {
                  const start = new Date(b.starts_at);
                  const end = new Date(b.ends_at);
                  const timeLabel = `${start.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })} – ${end.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`;

                  return (
                    <Button
                      key={b.id}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectBooking(b)}
                      className="flex w-full flex-col items-start gap-0.5 rounded-xl border border-orange-400/40 bg-orange-500/10 px-2 py-1.5 text-left text-[0.7rem] hover:bg-orange-500/20"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <div className="truncate font-semibold text-white">
                          {displayCustomerName(b)}
                        </div>
                        <div className="whitespace-nowrap text-[0.6rem] text-orange-200/90">
                          {timeLabel}
                        </div>
                      </div>
                      {b.notes && (
                        <div className="mt-0.5 line-clamp-2 text-[0.6rem] text-neutral-200/80">
                          {b.notes}
                        </div>
                      )}
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