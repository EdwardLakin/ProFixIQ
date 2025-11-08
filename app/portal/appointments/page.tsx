// app/portal/appointments/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast, Toaster } from "sonner";

import WeeklyCalendar from "app/portal/appointments/WeeklyCalendar";
import type { Database } from "@shared/types/types/supabase";

type ShopRow = Database["public"]["Tables"]["shops"]["Row"];

type Booking = {
  id: string;
  shop_slug?: string | null;
  starts_at: string; // ISO
  ends_at: string; // ISO
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  notes?: string | null;
  status?: string | null; // pending, confirmed, cancelled...
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function PortalAppointmentsPage() {
  const supabase = createClientComponentClient<Database>();
  const search = useSearchParams();
  const router = useRouter();

  // shops
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [shopSlug, setShopSlug] = useState<string>(search.get("shop") || "");

  // week
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const today = startOfToday();
    return today;
  });

  // data
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // form
  const [editing, setEditing] = useState<Booking | null>(null);
  const [creatingDate, setCreatingDate] = useState<string | null>(null);

  // load shops same as portal booking page
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("id,name,slug,accepts_online_booking")
        .eq("accepts_online_booking", true)
        .order("name", { ascending: true });

      if (error) {
        console.error(error);
        toast.error("Unable to load shops.");
        return;
      }
      const rows = (data ?? []) as ShopRow[];
      setShops(rows);

      // pick first by default
      if (!shopSlug && rows.length > 0) {
        const first = rows[0].slug as string;
        setShopSlug(first);
        router.replace(`/portal/appointments?shop=${encodeURIComponent(first)}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // compute week end (7 days)
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekStart]);

  // fetch bookings for week
  useEffect(() => {
    if (!shopSlug) return;
    (async () => {
      setLoadingBookings(true);
      try {
        const start = isoDate(weekStart);
        const end = isoDate(weekEnd);
        // assumes you have an API like /api/portal/bookings
        const res = await fetch(
          `/api/portal/bookings?shop=${encodeURIComponent(
            shopSlug
          )}&start=${start}&end=${end}`,
          { cache: "no-store" }
        );
        const j = (await res.json().catch(() => [])) as Booking[];
        setBookings(j ?? []);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load appointments.");
      } finally {
        setLoadingBookings(false);
      }
    })();
  }, [shopSlug, weekStart, weekEnd]);

  // create / save
  async function handleCreate(form: {
    date: string;
    startsAt: string;
    endsAt: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    notes: string;
  }) {
    if (!shopSlug) {
      toast.error("Select a shop first.");
      return;
    }

    try {
      const startIso = new Date(`${form.date}T${form.startsAt}`).toISOString();
      const endIso = new Date(`${form.date}T${form.endsAt}`).toISOString();
      // reuse existing booking endpoint so it's tied to portal
      const res = await fetch("/api/portal/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopSlug,
          startsAt: startIso,
          endsAt: endIso,
          notes: form.notes,
          customerName: form.customerName,
          customerEmail: form.customerEmail,
          customerPhone: form.customerPhone,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Unable to create appointment.");

      toast.success("Appointment created.");
      setCreatingDate(null);
      // refresh list
      const start = isoDate(weekStart);
      const end = isoDate(weekEnd);
      const refresh = await fetch(
        `/api/portal/bookings?shop=${encodeURIComponent(
          shopSlug
        )}&start=${start}&end=${end}`,
        { cache: "no-store" }
      );
      const refreshed = (await refresh.json().catch(() => [])) as Booking[];
      setBookings(refreshed);
    } catch (e: any) {
      toast.error(e?.message || "Create failed");
    }
  }

  async function handleUpdate(id: string, patch: Partial<Booking>) {
    try {
      const res = await fetch(`/api/portal/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Update failed");

      toast.success("Appointment updated.");
      setEditing(null);
      // refresh
      const start = isoDate(weekStart);
      const end = isoDate(weekEnd);
      const refresh = await fetch(
        `/api/portal/bookings?shop=${encodeURIComponent(
          shopSlug
        )}&start=${start}&end=${end}`,
        { cache: "no-store" }
      );
      const refreshed = (await refresh.json().catch(() => [])) as Booking[];
      setBookings(refreshed);
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this appointment?")) return;
    try {
      const res = await fetch(`/api/portal/bookings/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed.");
      toast.success("Appointment deleted.");
      setBookings((prev) => prev.filter((b) => b.id !== id));
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 text-white">
      <Toaster position="top-center" />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-blackops text-orange-400">
            Appointments
          </h1>
          <p className="text-xs text-neutral-400">
            Admin / manager / owner view of customer bookings for the week.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-neutral-300">Shop</label>
          <select
            value={shopSlug}
            onChange={(e) => {
              const slug = e.target.value;
              setShopSlug(slug);
              router.replace(
                `/portal/appointments?shop=${encodeURIComponent(slug)}`
              );
            }}
            className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
          >
            {shops.map((s) => (
              <option key={s.slug as string} value={s.slug as string}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* top section: 7-day calendar + list */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">
              This week&apos;s calendar
            </h2>
            <div className="flex gap-2">
              <button
                className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                onClick={() => {
                  const d = new Date(weekStart);
                  d.setDate(d.getDate() - 7);
                  setWeekStart(d);
                }}
              >
                ← Prev
              </button>
              <button
                className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                onClick={() => setWeekStart(startOfToday())}
              >
                Today
              </button>
              <button
                className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                onClick={() => {
                  const d = new Date(weekStart);
                  d.setDate(d.getDate() + 7);
                  setWeekStart(d);
                }}
              >
                Next →
              </button>
            </div>
          </div>

          <WeeklyCalendar
            weekStart={weekStart}
            bookings={bookings}
            onSelectDay={(dayIso) => setCreatingDate(dayIso)}
            onSelectBooking={(b) => setEditing(b)}
            loading={loadingBookings}
          />

          <p className="mt-3 text-xs text-neutral-500">
            Tip: click a day to start a new appointment on that day. Click an
            appointment to edit.
          </p>
        </div>

        {/* Right panel: list + form */}
        <div className="space-y-4">
          {/* list */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">
              Appointments ({bookings.length})
            </h2>
            {loadingBookings ? (
              <p className="text-sm text-neutral-400">Loading…</p>
            ) : bookings.length === 0 ? (
              <p className="text-sm text-neutral-400">
                No appointments for this week.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-800">
                {bookings
                  .slice()
                  .sort(
                    (a, b) =>
                      +new Date(a.starts_at) - +new Date(b.starts_at)
                  )
                  .map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center gap-3 py-3 text-sm"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-white">
                          {b.customer_name || "Customer"}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {new Date(b.starts_at).toLocaleString()} –{" "}
                          {new Date(b.ends_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        {b.notes ? (
                          <div className="text-xs text-neutral-500">
                            {b.notes}
                          </div>
                        ) : null}
                      </div>
                      <button
                        onClick={() => setEditing(b)}
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDelete(b.id)}
                        className="rounded border border-red-500 px-2 py-1 text-xs text-red-200 hover:bg-red-900/40"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* create / edit form */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            {editing ? (
              <EditForm
                booking={editing}
                onCancel={() => setEditing(null)}
                onSave={(patch) => void handleUpdate(editing.id, patch)}
              />
            ) : (
              <CreateForm
                defaultDate={creatingDate ?? isoDate(weekStart)}
                onSubmit={handleCreate}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateForm({
  defaultDate,
  onSubmit,
}: {
  defaultDate: string;
  onSubmit: (form: {
    date: string;
    startsAt: string;
    endsAt: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    notes: string;
  }) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [startsAt, setStartsAt] = useState("09:00");
  const [endsAt, setEndsAt] = useState("10:00");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setDate(defaultDate);
  }, [defaultDate]);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          date,
          startsAt,
          endsAt,
          customerName,
          customerEmail,
          customerPhone,
          notes,
        });
      }}
    >
      <h3 className="text-sm font-semibold text-white">
        Create appointment
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-neutral-300">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-neutral-300">
            Start
            <input
              type="time"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
            />
          </label>
          <label className="flex-1 text-xs text-neutral-300">
            End
            <input
              type="time"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
            />
          </label>
        </div>
      </div>
      <label className="text-xs text-neutral-300">
        Customer name
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          placeholder="John Smith"
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-neutral-300">
          Email
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-neutral-300">
          Phone
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          />
        </label>
      </div>
      <label className="text-xs text-neutral-300">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
        />
      </label>
      <button
        type="submit"
        className="rounded border border-orange-600 bg-orange-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-orange-400"
      >
        Save appointment
      </button>
    </form>
  );
}

function EditForm({
  booking,
  onCancel,
  onSave,
}: {
  booking: Booking;
  onCancel: () => void;
  onSave: (patch: Partial<Booking>) => void;
}) {
  const start = new Date(booking.starts_at);
  const end = new Date(booking.ends_at);

  const [date, setDate] = useState(booking.starts_at.slice(0, 10));
  const [startsAt, setStartsAt] = useState(
    start.toISOString().slice(11, 16)
  );
  const [endsAt, setEndsAt] = useState(end.toISOString().slice(11, 16));
  const [customerName, setCustomerName] = useState(
    booking.customer_name ?? ""
  );
  const [customerEmail, setCustomerEmail] = useState(
    booking.customer_email ?? ""
  );
  const [customerPhone, setCustomerPhone] = useState(
    booking.customer_phone ?? ""
  );
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [status, setStatus] = useState(booking.status ?? "pending");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const starts_at = new Date(`${date}T${startsAt}`).toISOString();
        const ends_at = new Date(`${date}T${endsAt}`).toISOString();
        onSave({
          starts_at,
          ends_at,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          notes,
          status,
        });
      }}
    >
      <h3 className="text-sm font-semibold text-white">Edit appointment</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-neutral-300">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-neutral-300">
            Start
            <input
              type="time"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
            />
          </label>
          <label className="flex-1 text-xs text-neutral-300">
            End
            <input
              type="time"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
            />
          </label>
        </div>
      </div>
      <label className="text-xs text-neutral-300">
        Customer name
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-neutral-300">
          Email
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-neutral-300">
          Phone
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          />
        </label>
      </div>
      <label className="text-xs text-neutral-300">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs text-neutral-300">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
        >
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded border border-orange-600 bg-orange-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-orange-400"
        >
          Save changes
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}