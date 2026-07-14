"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Booking } from "./page";
import { Button } from "@shared/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/components/ui/dialog";

type Props = {
  open: boolean;
  shopSlug: string;
  initialDate: Date;
  onOpenChange: (open: boolean) => void;
  onCreate: (dayIso: string) => void;
  onEdit: (booking: Booking) => void;
  onApprove: (booking: Booking) => Promise<boolean>;
  onDecline: (booking: Booking) => Promise<boolean>;
  onOpenWorkOrder: (booking: Booking) => void;
  onCreateWorkOrder: (booking: Booking) => void;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function calendarStart(date: Date): Date {
  const first = monthStart(date);
  return addDays(first, -first.getDay());
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusOf(booking: Booking): string {
  return (booking.status || "pending").toLowerCase();
}

function statusClass(status?: string | null): string {
  const normalized = (status || "pending").toLowerCase();
  if (normalized === "confirmed") {
    return "border-emerald-500/25 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200";
  }
  if (normalized === "cancelled") {
    return "border-red-500/25 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200";
  }
  return "border-amber-500/30 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200";
}

function canCreateWorkOrder(booking: Booking): boolean {
  return (
    statusOf(booking) !== "cancelled" &&
    !booking.work_order_id &&
    Boolean(
      booking.customer_id ||
      booking.customer_name?.trim() ||
      booking.customer_email?.trim() ||
      booking.customer_phone?.trim(),
    )
  );
}

export default function FullCalendarModal({
  open,
  shopSlug,
  initialDate,
  onOpenChange,
  onCreate,
  onEdit,
  onApprove,
  onDecline,
  onOpenWorkOrder,
  onCreateWorkOrder,
}: Props) {
  const [cursor, setCursor] = useState(() => monthStart(initialDate));
  const [selectedDay, setSelectedDay] = useState(() => dayKey(initialDate));
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    null,
  );
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCursor(monthStart(initialDate));
    setSelectedDay(dayKey(initialDate));
    setSelectedBookingId(null);
  }, [initialDate, open]);

  const gridDays = useMemo(() => {
    const start = calendarStart(cursor);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [cursor]);

  const fetchBookings = useCallback(
    async (signal?: AbortSignal) => {
      if (!shopSlug) return;
      const start = dayKey(gridDays[0]);
      const end = dayKey(gridDays[gridDays.length - 1]);
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/portal/bookings?shop=${encodeURIComponent(shopSlug)}&start=${start}&end=${end}`,
          { cache: "no-store", signal },
        );
        const body = (await response.json().catch(() => null)) as
          | Booking[]
          | { error?: string }
          | null;
        if (!response.ok) {
          throw new Error(
            body && !Array.isArray(body)
              ? body.error || "Unable to load calendar."
              : "Unable to load calendar.",
          );
        }
        setBookings(Array.isArray(body) ? body : []);
      } catch (caught: unknown) {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        setError(
          caught instanceof Error ? caught.message : "Unable to load calendar.",
        );
      } finally {
        setLoading(false);
      }
    },
    [gridDays, shopSlug],
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetchBookings(controller.signal);
    return () => controller.abort();
  }, [fetchBookings, open]);

  const grouped = useMemo(() => {
    const result = new Map<string, Booking[]>();
    for (const booking of bookings) {
      const key = dayKey(new Date(booking.starts_at));
      const current = result.get(key) || [];
      current.push(booking);
      result.set(key, current);
    }
    result.forEach((items) =>
      items.sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)),
    );
    return result;
  }, [bookings]);

  const dayBookings = grouped.get(selectedDay) || [];
  const selectedBooking =
    bookings.find((booking) => booking.id === selectedBookingId) || null;
  const today = dayKey(new Date());

  function moveMonth(amount: number) {
    setCursor(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + amount, 1),
    );
    setSelectedBookingId(null);
  }

  async function changeStatus(
    booking: Booking,
    nextStatus: "confirmed" | "cancelled",
  ) {
    setActing(true);
    const succeeded =
      nextStatus === "confirmed"
        ? await onApprove(booking)
        : await onDecline(booking);
    if (succeeded) {
      setBookings((current) =>
        current.map((item) =>
          item.id === booking.id ? { ...item, status: nextStatus } : item,
        ),
      );
    }
    setActing(false);
  }

  function closeThen(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92vh,920px)] w-[min(96vw,1500px)] max-w-none flex-col overflow-hidden bg-[color:var(--theme-surface-page)] p-0">
        <DialogHeader className="shrink-0 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
            <div>
              <DialogTitle className="text-base normal-case tracking-normal sm:text-xl">
                Full calendar
              </DialogTitle>
              <DialogDescription>
                Review capacity by month, then open any day or appointment.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => closeThen(() => onCreate(selectedDay))}
              >
                New appointment
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-auto lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
          <section className="flex min-h-0 flex-col border-b border-[color:var(--theme-border-soft)] lg:border-b-0 lg:border-r">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-3 sm:px-6">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => moveMonth(-1)}
                aria-label="Previous month"
              >
                ←
              </Button>
              <div className="text-center">
                <div className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
                  {cursor.toLocaleDateString([], {
                    month: "long",
                    year: "numeric",
                  })}
                </div>
                {loading ? (
                  <div className="text-xs text-[color:var(--theme-text-muted)]">
                    Updating calendar…
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const current = new Date();
                    setCursor(monthStart(current));
                    setSelectedDay(dayKey(current));
                    setSelectedBookingId(null);
                  }}
                >
                  Today
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => moveMonth(1)}
                  aria-label="Next month"
                >
                  →
                </Button>
              </div>
            </div>

            {error ? (
              <div className="m-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/25 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/25 dark:text-red-200">
                <span>{error}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => void fetchBookings()}
                >
                  Retry
                </Button>
              </div>
            ) : null}

            <div className="grid grid-cols-7 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-center text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)] sm:px-5">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (label) => (
                  <div key={label}>{label}</div>
                ),
              )}
            </div>

            <div className="grid min-h-[430px] flex-1 grid-cols-7 grid-rows-6 gap-px overflow-auto bg-[color:var(--theme-border-soft)]">
              {gridDays.map((date) => {
                const key = dayKey(date);
                const items = grouped.get(key) || [];
                const active = items.filter(
                  (item) => statusOf(item) !== "cancelled",
                );
                const pending = items.filter(
                  (item) => statusOf(item) === "pending",
                ).length;
                const confirmed = items.filter(
                  (item) => statusOf(item) === "confirmed",
                ).length;
                const inMonth = date.getMonth() === cursor.getMonth();
                const selected = key === selectedDay;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedDay(key);
                      setSelectedBookingId(null);
                    }}
                    className={[
                      "min-h-[76px] p-1.5 text-left transition sm:min-h-[92px] sm:p-2",
                      selected
                        ? "bg-[color:var(--theme-surface-panel-strong)] ring-2 ring-inset ring-[rgba(184,115,51,0.7)]"
                        : "bg-[color:var(--theme-surface-page)] hover:bg-[color:var(--theme-surface-subtle)]",
                      inMonth ? "" : "opacity-45",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={[
                          "flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-semibold",
                          key === today
                            ? "bg-[color:var(--theme-accent,var(--pfq-copper,#b87333))] text-white"
                            : "text-[color:var(--theme-text-primary)]",
                        ].join(" ")}
                      >
                        {date.getDate()}
                      </span>
                      {active.length ? (
                        <span className="text-[0.65rem] font-semibold text-[color:var(--theme-text-secondary)]">
                          {active.length}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 hidden space-y-1 sm:block">
                      {confirmed ? (
                        <div className="truncate rounded bg-emerald-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                          {confirmed} confirmed
                        </div>
                      ) : null}
                      {pending ? (
                        <div className="truncate rounded bg-amber-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          {pending} pending
                        </div>
                      ) : null}
                    </div>
                    {active.length ? (
                      <div className="mt-2 h-1 rounded-full bg-[rgba(184,115,51,0.28)] sm:hidden" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="min-h-0 overflow-auto bg-[color:var(--theme-surface-inset)] p-4 sm:p-5">
            {selectedBooking ? (
              <div className="space-y-4">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setSelectedBookingId(null)}
                >
                  ← Day agenda
                </Button>
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold text-[color:var(--theme-text-primary)]">
                      {selectedBooking.customer_name || "Customer"}
                    </h3>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${statusClass(selectedBooking.status)}`}
                    >
                      {selectedBooking.status || "pending"}
                    </span>
                  </div>
                  <p className="text-sm text-[color:var(--theme-text-secondary)]">
                    {new Date(selectedBooking.starts_at).toLocaleDateString(
                      [],
                      {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      },
                    )}
                  </p>
                  <p className="font-semibold text-[color:var(--theme-text-primary)]">
                    {formatTime(selectedBooking.starts_at)} –{" "}
                    {formatTime(selectedBooking.ends_at)}
                  </p>
                </div>

                <div className="space-y-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-4 text-sm">
                  <Detail
                    label="Phone"
                    value={selectedBooking.customer_phone}
                  />
                  <Detail
                    label="Email"
                    value={selectedBooking.customer_email}
                  />
                  <Detail label="Notes" value={selectedBooking.notes} />
                  <Detail
                    label="Work order"
                    value={
                      selectedBooking.work_order_id ? "Linked" : "Not created"
                    }
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {statusOf(selectedBooking) === "pending" ? (
                    <>
                      <Button
                        type="button"
                        disabled={acting}
                        onClick={() =>
                          void changeStatus(selectedBooking, "confirmed")
                        }
                      >
                        Approve request
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={acting}
                        className="border-red-500/35 text-red-700 dark:text-red-200"
                        onClick={() =>
                          void changeStatus(selectedBooking, "cancelled")
                        }
                      >
                        Decline
                      </Button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => closeThen(() => onEdit(selectedBooking))}
                  >
                    Edit
                  </Button>
                  {selectedBooking.work_order_id ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        closeThen(() => onOpenWorkOrder(selectedBooking))
                      }
                    >
                      Open work order
                    </Button>
                  ) : canCreateWorkOrder(selectedBooking) ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        closeThen(() => onCreateWorkOrder(selectedBooking))
                      }
                    >
                      Create work order
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
                      Day agenda
                    </div>
                    <h3 className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
                      {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(
                        [],
                        { weekday: "long", month: "long", day: "numeric" },
                      )}
                    </h3>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    onClick={() => closeThen(() => onCreate(selectedDay))}
                  >
                    Add
                  </Button>
                </div>

                <div className="flex gap-2 text-xs text-[color:var(--theme-text-secondary)]">
                  <span>
                    {
                      dayBookings.filter(
                        (item) => statusOf(item) !== "cancelled",
                      ).length
                    }{" "}
                    active
                  </span>
                  <span>•</span>
                  <span>
                    {
                      dayBookings.filter((item) => statusOf(item) === "pending")
                        .length
                    }{" "}
                    pending
                  </span>
                </div>

                {dayBookings.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-6 text-center text-sm text-[color:var(--theme-text-muted)]">
                    No appointments scheduled for this day.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dayBookings.map((booking) => (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => setSelectedBookingId(booking.id)}
                        className="w-full rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-3 text-left transition hover:border-[rgba(184,115,51,0.45)] hover:shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-[color:var(--theme-text-primary)]">
                              {booking.customer_name || "Customer"}
                            </div>
                            <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                              {formatTime(booking.starts_at)} –{" "}
                              {formatTime(booking.ends_at)}
                            </div>
                          </div>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.1em] ${statusClass(booking.status)}`}
                          >
                            {booking.status || "pending"}
                          </span>
                        </div>
                        {booking.notes ? (
                          <p className="mt-2 line-clamp-2 text-xs text-[color:var(--theme-text-muted)]">
                            {booking.notes}
                          </p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className="mt-0.5 break-words text-[color:var(--theme-text-primary)]">
        {value || "Not provided"}
      </div>
    </div>
  );
}
