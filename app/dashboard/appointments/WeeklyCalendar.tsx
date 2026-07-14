// app/dashboard/appointments/WeeklyCalendar.tsx
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
  if (s === "confirmed") return "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200";
  if (s === "cancelled") return "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-200";
  return "border-amber-500/30 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
}

function bookingCardStyle(status?: string | null) {
  const s = (status || "pending").toLowerCase();
  if (s === "cancelled") {
    return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-inset)]";
  }
  if (s === "confirmed") {
    return "border-emerald-500/25 bg-emerald-50/70 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30";
  }
  // pending
  return "border-amber-500/30 bg-amber-50/70 hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30";
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
    <div className="grid min-w-[1120px] grid-cols-7 gap-3">
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
            className="flex min-h-[240px] min-w-0 flex-col gap-2 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-xs text-[color:var(--theme-text-primary)] shadow-sm"
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
                    <span className="rounded-full bg-[color:var(--desktop-item-bg)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em]">
                      Today
                    </span>
                  ) : null}

                  <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-0.5 text-[0.65rem] text-[color:var(--theme-text-primary)]">
                    {activeCount}
                  </span>
                </span>
              </Button>
            </div>

            {/* Appointments list */}
            <div className="flex-1 space-y-1.5">
              {loading && dayBookings.length === 0 ? (
                <div className="space-y-2">
                  <div className="h-9 w-full animate-pulse rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]" />
                  <div className="h-9 w-full animate-pulse rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]" />
                </div>
              ) : dayBookings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2 py-2 text-[0.65rem] text-[color:var(--theme-text-muted)]">
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
                        <div className={"truncate font-semibold " + (isCancelled ? "text-[color:var(--theme-text-secondary)] line-through" : "text-[color:var(--theme-text-primary)]")}>
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

                          <span className={"whitespace-nowrap text-[0.6rem] " + (isCancelled ? "text-[color:var(--theme-text-secondary)]" : "text-[color:var(--theme-text-primary)]")}>
                            {timeLabel(b.starts_at, b.ends_at)}
                          </span>
                        </div>
                      </div>

                      {b.notes ? (
                        <div className="line-clamp-2 text-[0.62rem] text-[color:var(--theme-text-secondary)]">
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
