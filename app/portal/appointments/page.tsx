"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast, Toaster } from "sonner";

import WeeklyCalendar from "./WeeklyCalendar";
import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";

type ShopRow = Database["public"]["Tables"]["shops"]["Row"];
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

export type Booking = {
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

  // customers for selected shop
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // week
  const [weekStart, setWeekStart] = useState<Date>(() => startOfToday());

  // data
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // form
  const [editing, setEditing] = useState<Booking | null>(null);
  const [creatingDate, setCreatingDate] = useState<string | null>(null);

  // load shops
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

      if (!shopSlug && rows.length > 0) {
        const first = rows[0].slug as string;
        setShopSlug(first);
        router.replace(
          `/portal/appointments?shop=${encodeURIComponent(first)}`
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // get selected shop row
  const selectedShop = useMemo(
    () => shops.find((s) => (s.slug as string | null) === shopSlug) ?? null,
    [shops, shopSlug]
  );

  // load customers for selected shop
  useEffect(() => {
    if (!selectedShop) return;

    (async () => {
      setLoadingCustomers(true);
      try {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("shop_id", selectedShop.id)
          // order by real columns instead of non-existent full_name
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true });

        if (error) {
          console.error(error);
          toast.error("Unable to load customers.");
          setCustomers([]);
        } else {
          setCustomers((data ?? []) as CustomerRow[]);
        }
      } catch (e) {
        console.error(e);
        toast.error("Unable to load customers.");
        setCustomers([]);
      } finally {
        setLoadingCustomers(false);
      }
    })();
  }, [supabase, selectedShop]);

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
        const res = await fetch(
          `/api/portal/bookings?shop=${encodeURIComponent(
            shopSlug
          )}&start=${start}&end=${end}`,
          { cache: "no-store" }
        );
        const j = (await res.json().catch(() => [])) as Booking[];
        setBookings(j ?? []);
      } catch (err: unknown) {
        console.error(err);
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
    customerId?: string;
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
      const res = await fetch("/api/portal/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopSlug,
          startsAt: startIso,
          endsAt: endIso,
          notes: form.notes,
          customerId: form.customerId ?? null,
          customerName: form.customerName,
          customerEmail: form.customerEmail,
          customerPhone: form.customerPhone,
        }),
      });

      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j?.error || "Unable to create appointment.");

      const who = form.customerName || form.customerEmail || form.customerPhone;
      toast.success(
        who
          ? `Appointment created for ${who}.`
          : "Appointment created."
      );
      setCreatingDate(null);
      await refreshBookings(shopSlug, weekStart, weekEnd, setBookings);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Create failed";
      toast.error(message);
    }
  }

  async function handleUpdate(id: string, patch: Partial<Booking>) {
    try {
      const res = await fetch(`/api/portal/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j?.error || "Update failed");

      toast.success("Appointment updated.");
      setEditing(null);
      await refreshBookings(shopSlug, weekStart, weekEnd, setBookings);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Update failed";
      toast.error(message);
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
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Delete failed";
      toast.error(message);
    }
  }

  const totalForWeek = useMemo(() => bookings.length, [bookings]);

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 text-white">
      <Toaster position="top-center" />

      {/* header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-300">
            Appointments
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            Admin / manager / owner view of customer bookings for the week.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
          <label className="text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400">
            Shop
          </label>
          <select
            value={shopSlug}
            onChange={(e) => {
              const slug = e.target.value;
              setShopSlug(slug);
              router.replace(
                `/portal/appointments?shop=${encodeURIComponent(slug)}`
              );
            }}
            className="min-w-[180px] rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            {shops.map((s) => (
              <option key={s.slug as string} value={s.slug as string}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="ml-2 text-xs text-neutral-300">
            <span className="text-[0.65rem] uppercase tracking-[0.13em] text-neutral-500">
              This week
            </span>
            <div className="font-semibold">
              {totalForWeek} booking{totalForWeek === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>

      {/* main layout: stacked (calendar → form → list) */}
      <div className="space-y-6">
        {/* calendar */}
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 overflow-hidden backdrop-blur-md shadow-card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">
              This week&apos;s calendar
            </h2>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  const d = new Date(weekStart);
                  d.setDate(d.getDate() - 7);
                  setWeekStart(d);
                }}
              >
                ← Prev
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setWeekStart(startOfToday())}
              >
                Today
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  const d = new Date(weekStart);
                  d.setDate(d.getDate() + 7);
                  setWeekStart(d);
                }}
              >
                Next →
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto pb-2">
            <WeeklyCalendar
              weekStart={weekStart}
              bookings={bookings}
              onSelectDay={(dayIso) => setCreatingDate(dayIso)}
              onSelectBooking={(b) => setEditing(b)}
              loading={loadingBookings}
            />
          </div>

          <p className="mt-3 text-[0.7rem] text-neutral-500">
            Tip: click a day to start a new appointment on that day. Click an
            appointment to edit.
          </p>
        </div>

        {/* create / edit form */}
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-md shadow-card">
          {editing ? (
            <EditForm
              booking={editing}
              customers={customers}
              loadingCustomers={loadingCustomers}
              onCancel={() => setEditing(null)}
              onSave={(patch) => void handleUpdate(editing.id, patch)}
            />
          ) : (
            <CreateForm
              defaultDate={creatingDate ?? isoDate(weekStart)}
              customers={customers}
              loadingCustomers={loadingCustomers}
              onSubmit={handleCreate}
            />
          )}
        </div>

        {/* appointments list */}
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-md shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Appointments this week ({bookings.length})
            </h2>
            {loadingBookings && (
              <span className="text-[0.7rem] text-neutral-400">
                Loading…
              </span>
            )}
          </div>

          {loadingBookings ? (
            <p className="text-sm text-neutral-400">
              Fetching appointments…
            </p>
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
                    className="flex flex-wrap items-center gap-3 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-white">
                        {b.customer_name || "Customer"}
                      </div>
                      <div className="text-[0.7rem] text-neutral-400">
                        {new Date(b.starts_at).toLocaleString()} –{" "}
                        {new Date(b.ends_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      {b.notes ? (
                        <div className="mt-1 text-[0.7rem] text-neutral-500">
                          {b.notes}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => setEditing(b)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="text-red-300 hover:bg-red-900/25"
                        onClick={() => void handleDelete(b.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

async function refreshBookings(
  shopSlug: string,
  weekStart: Date,
  weekEnd: Date,
  setBookings: (b: Booking[]) => void
) {
  const start = isoDate(weekStart);
  const end = isoDate(weekEnd);
  const res = await fetch(
    `/api/portal/bookings?shop=${encodeURIComponent(
      shopSlug
    )}&start=${start}&end=${end}`,
    { cache: "no-store" }
  );
  const refreshed = (await res.json().catch(() => [])) as Booking[];
  setBookings(refreshed);
}

/* -------------------------------------------------------------------------- */
/* Forms                                                                      */
/* -------------------------------------------------------------------------- */

function customerLabel(c: CustomerRow): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyC: any = c;
  const name =
    anyC.full_name ||
    anyC.name ||
    `${anyC.first_name ?? ""} ${anyC.last_name ?? ""}`.trim() ||
    "Customer";
  const phone = anyC.phone || anyC.mobile || "";
  return phone ? `${name} (${phone})` : name;
}

function CreateForm({
  defaultDate,
  customers,
  loadingCustomers,
  onSubmit,
}: {
  defaultDate: string;
  customers: CustomerRow[];
  loadingCustomers: boolean;
  onSubmit: (form: {
    date: string;
    startsAt: string;
    endsAt: string;
    customerId?: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    notes: string;
  }) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [startsAt, setStartsAt] = useState("09:00");
  const [endsAt, setEndsAt] = useState("10:00");
  const [customerId, setCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setDate(defaultDate);
  }, [defaultDate]);

  const handleSelectCustomer = (id: string) => {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyC: any = c;
    const name =
      anyC.full_name ||
      anyC.name ||
      `${anyC.first_name ?? ""} ${anyC.last_name ?? ""}`.trim();
    setCustomerName(name || "");
    setCustomerEmail(anyC.email || anyC.contact_email || "");
    setCustomerPhone(anyC.phone || anyC.mobile || "");
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();

        // basic validation with toasts
        if (!startsAt || !endsAt || startsAt >= endsAt) {
          toast.error("End time must be after start time.");
          return;
        }

        if (
          !customerId &&
          !customerName.trim() &&
          !customerEmail.trim() &&
          !customerPhone.trim()
        ) {
          toast.error(
            "Add at least a customer name, email, or phone before saving."
          );
          return;
        }

        onSubmit({
          date,
          startsAt,
          endsAt,
          customerId: customerId || undefined,
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
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-neutral-300">
            Start
            <input
              type="time"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </label>
          <label className="flex-1 text-xs text-neutral-300">
            End
            <input
              type="time"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </label>
        </div>
      </div>

      <label className="text-xs text-neutral-300">
        Customer (from database)
        <select
          value={customerId}
          onChange={(e) => handleSelectCustomer(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">{loadingCustomers ? "Loading…" : "Select…"}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {customerLabel(c)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-neutral-300">
        Customer name
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white"
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
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-xs text-neutral-300">
          Phone
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white"
          />
        </label>
      </div>

      <label className="text-xs text-neutral-300">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white"
        />
      </label>

      <Button type="submit" size="sm" className="mt-1 font-semibold">
        Save appointment
      </Button>
    </form>
  );
}

function EditForm({
  booking,
  customers,
  loadingCustomers,
  onCancel,
  onSave,
}: {
  booking: Booking;
  customers: CustomerRow[];
  loadingCustomers: boolean;
  onCancel: () => void;
  onSave: (patch: Partial<Booking>) => void;
}) {
  const start = new Date(booking.starts_at);
  const end = new Date(booking.ends_at);

  const [date, setDate] = useState(booking.starts_at.slice(0, 10));
  const [startsAt, setStartsAt] = useState(start.toISOString().slice(11, 16));
  const [endsAt, setEndsAt] = useState(end.toISOString().slice(11, 16));

  const [customerId, setCustomerId] = useState<string>(
    booking.customer_id ?? ""
  );
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

  const handleSelectCustomer = (id: string) => {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyC: any = c;
    const name =
      anyC.full_name ||
      anyC.name ||
      `${anyC.first_name ?? ""} ${anyC.last_name ?? ""}`.trim();
    setCustomerName(name || "");
    setCustomerEmail(anyC.email || anyC.contact_email || "");
    setCustomerPhone(anyC.phone || anyC.mobile || "");
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();

        if (!startsAt || !endsAt || startsAt >= endsAt) {
          toast.error("End time must be after start time.");
          return;
        }

        if (
          !customerId &&
          !customerName.trim() &&
          !customerEmail.trim() &&
          !customerPhone.trim()
        ) {
          toast.error(
            "Add at least a customer name, email, or phone before saving."
          );
          return;
        }

        const starts_at = new Date(`${date}T${startsAt}`).toISOString();
        const ends_at = new Date(`${date}T${endsAt}`).toISOString();
        onSave({
          starts_at,
          ends_at,
          customer_id: customerId || null,
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
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-neutral-300">
            Start
            <input
              type="time"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white"
            />
          </label>
          <label className="flex-1 text-xs text-neutral-300">
            End
            <input
              type="time"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white"
            />
          </label>
        </div>
      </div>

      <label className="text-xs text-neutral-300">
        Customer (from database)
        <select
          value={customerId}
          onChange={(e) => handleSelectCustomer(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white"
        >
          <option value="">{loadingCustomers ? "Loading…" : "Select…"}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {customerLabel(c)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-neutral-300">
        Customer name
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white"
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-neutral-300">
          Email
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-xs text-neutral-300">
          Phone
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white"
          />
        </label>
      </div>

      <label className="text-xs text-neutral-300">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white"
        />
      </label>

      <label className="text-xs text-neutral-300">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white"
        >
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>

      <div className="flex gap-2">
        <Button type="submit" size="sm" className="font-semibold">
          Save changes
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}