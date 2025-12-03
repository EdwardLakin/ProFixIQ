// app/mobile/appointments/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Toaster, toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";

type DB = Database;
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];

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

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function MobileAppointmentsPage() {
  const supabase = createClientComponentClient<DB>();
  const search = useSearchParams();
  const router = useRouter();

  // shops
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [shopSlug, setShopSlug] = useState<string>(search.get("shop") || "");

  // customers for selected shop
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // day (mobile: single-day view, not weekly)
  const [day, setDay] = useState<string>(() => isoDate(startOfToday()));

  // data
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // form state
  const [editing, setEditing] = useState<Booking | null>(null);

  /* --------------------------------- Shops --------------------------------- */

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("id,name,slug,accepts_online_booking")
        .eq("accepts_online_booking", true)
        .order("name", { ascending: true });

      if (error) {
        // eslint-disable-next-line no-console
        console.error(error);
        toast.error("Unable to load shops.");
        return;
      }

      const rows = (data ?? []) as ShopRow[];
      setShops(rows);

      // default to first shop if none selected
      if (!shopSlug && rows.length > 0) {
        const first = rows[0].slug as string;
        setShopSlug(first);
        router.replace(
          `/mobile/appointments?shop=${encodeURIComponent(first)}`,
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // selected shop row
  const selectedShop = useMemo(
    () => shops.find((s) => (s.slug as string | null) === shopSlug) ?? null,
    [shops, shopSlug],
  );

  /* ------------------------------ Customers -------------------------------- */

  useEffect(() => {
    if (!selectedShop) return;

    (async () => {
      setLoadingCustomers(true);
      try {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("shop_id", selectedShop.id)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true });

        if (error) {
          // eslint-disable-next-line no-console
          console.error(error);
          toast.error("Unable to load customers.");
          setCustomers([]);
        } else {
          setCustomers((data ?? []) as CustomerRow[]);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        toast.error("Unable to load customers.");
        setCustomers([]);
      } finally {
        setLoadingCustomers(false);
      }
    })();
  }, [supabase, selectedShop]);

  /* ------------------------------ Bookings --------------------------------- */

  useEffect(() => {
    if (!shopSlug || !day) return;

    (async () => {
      setLoadingBookings(true);
      try {
        // mobile: single day window
        const res = await fetch(
          `/api/portal/bookings?shop=${encodeURIComponent(
            shopSlug,
          )}&start=${day}&end=${day}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("Failed to load appointments.");
        const j = (await res.json().catch(() => [])) as Booking[];
        setBookings(j ?? []);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        toast.error("Failed to load appointments.");
      } finally {
        setLoadingBookings(false);
      }
    })();
  }, [shopSlug, day]);

  async function refreshDay() {
    if (!shopSlug || !day) return;
    try {
      const res = await fetch(
        `/api/portal/bookings?shop=${encodeURIComponent(
          shopSlug,
        )}&start=${day}&end=${day}`,
        { cache: "no-store" },
      );
      const refreshed = (await res.json().catch(() => [])) as Booking[];
      setBookings(refreshed ?? []);
    } catch {
      // ignore, already tosted by caller usually
    }
  }

  /* -------------------------- Create / Update / Delete --------------------- */

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

      const j = (await res
        .json()
        .catch(() => ({}))) as { booking?: Booking; error?: string };

      if (!res.ok || !j.booking) {
        throw new Error(j?.error || "Unable to create appointment.");
      }

      toast.success("Appointment created.");
      setDay(form.date); // jump day to created date if different
      await refreshDay();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Create failed";
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
      await refreshDay();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Update failed";
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
      const message = err instanceof Error ? err.message : "Delete failed";
      toast.error(message);
    }
  }

  const totalForDay = bookings.length;

  /* -------------------------------- Render --------------------------------- */

  return (
    <main className="min-h-screen bg-black text-white">
      <Toaster position="top-center" />

      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-8 pt-4">
        {/* Header */}
        <header className="space-y-1">
          <div className="text-[0.7rem] uppercase tracking-[0.24em] text-neutral-500">
            ProFixIQ • Appointments
          </div>
          <h1 className="font-blackops text-lg uppercase tracking-[0.18em] text-orange-400">
            Today&apos;s bookings
          </h1>
          <p className="text-[0.75rem] text-neutral-400">
            Mobile view for advisors / managers to manage the day&apos;s
            appointments.
          </p>
        </header>

        {/* Shop + day picker */}
        <section className="space-y-3 rounded-2xl border border-white/10 bg-black/40 p-3 shadow-card backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <label className="flex-1 text-[0.65rem] uppercase tracking-[0.12em] text-neutral-400">
              Shop
              <select
                value={shopSlug}
                onChange={(e) => {
                  const slug = e.target.value;
                  setShopSlug(slug);
                  router.replace(
                    `/mobile/appointments?shop=${encodeURIComponent(slug)}`,
                  );
                }}
                className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                {shops.map((s) => (
                  <option key={s.slug as string} value={s.slug as string}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col items-end text-right">
              <span className="text-[0.6rem] uppercase tracking-[0.12em] text-neutral-500">
                Today
              </span>
              <span className="text-sm font-semibold text-neutral-100">
                {totalForDay} appt{totalForDay === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex-1 text-[0.65rem] uppercase tracking-[0.12em] text-neutral-400">
              Date
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </label>
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  const d = new Date(day);
                  d.setDate(d.getDate() - 1);
                  setDay(isoDate(d));
                }}
              >
                ←
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setDay(isoDate(startOfToday()))}
              >
                Today
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  const d = new Date(day);
                  d.setDate(d.getDate() + 1);
                  setDay(isoDate(d));
                }}
              >
                →
              </Button>
            </div>
          </div>
        </section>

        {/* Create / edit form */}
        <section className="space-y-2 rounded-2xl border border-white/10 bg-black/40 p-3 shadow-card backdrop-blur-md">
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
              defaultDate={day}
              customers={customers}
              loadingCustomers={loadingCustomers}
              onSubmit={handleCreate}
            />
          )}
        </section>

        {/* List for the selected day */}
        <section className="space-y-2 rounded-2xl border border-white/10 bg-black/40 p-3 shadow-card backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Appointments for this day
            </h2>
            {loadingBookings && (
              <span className="text-[0.65rem] text-neutral-400">
                Loading…
              </span>
            )}
          </div>

          {loadingBookings ? (
            <p className="text-xs text-neutral-400">Fetching appointments…</p>
          ) : bookings.length === 0 ? (
            <p className="text-xs text-neutral-400">
              No appointments for this day.
            </p>
          ) : (
            <ul className="space-y-2">
              {bookings
                .slice()
                .sort(
                  (a, b) =>
                    +new Date(a.starts_at) - +new Date(b.starts_at),
                )
                .map((b) => {
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
                    <li
                      key={b.id}
                      className="flex items-start justify-between gap-2 rounded-xl border border-white/12 bg-black/50 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-neutral-50">
                          {b.customer_name || "Customer"}
                        </div>
                        <div className="mt-0.5 text-[0.7rem] text-neutral-400">
                          {timeLabel}
                        </div>
                        {b.notes && (
                          <div className="mt-0.5 line-clamp-2 text-[0.7rem] text-neutral-500">
                            {b.notes}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
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
                  );
                })}
            </ul>
          )}
        </section>

        <footer className="pt-1 text-center text-[0.65rem] text-neutral-500">
          Mobile day planner • desktop view is available under Appointments in
          the main app.
        </footer>
      </div>
    </main>
  );
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
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-300">
        Create appointment
      </h3>

      <div className="space-y-2">
        <label className="text-[0.7rem] text-neutral-300">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </label>

        <div className="flex gap-2">
          <label className="flex-1 text-[0.7rem] text-neutral-300">
            Start
            <input
              type="time"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </label>
          <label className="flex-1 text-[0.7rem] text-neutral-300">
            End
            <input
              type="time"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </label>
        </div>
      </div>

      <label className="text-[0.7rem] text-neutral-300">
        Customer (from database)
        <select
          value={customerId}
          onChange={(e) => handleSelectCustomer(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">
            {loadingCustomers ? "Loading…" : "Select…"}
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {customerLabel(c)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-[0.7rem] text-neutral-300">
        Customer name
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white"
          placeholder="John Smith"
        />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1 text-[0.7rem] text-neutral-300">
          Email
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white"
          />
        </label>
        <label className="flex-1 text-[0.7rem] text-neutral-300">
          Phone
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white"
          />
        </label>
      </div>

      <label className="text-[0.7rem] text-neutral-300">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white"
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
    booking.customer_id ?? "",
  );
  const [customerName, setCustomerName] = useState(
    booking.customer_name ?? "",
  );
  const [customerEmail, setCustomerEmail] = useState(
    booking.customer_email ?? "",
  );
  const [customerPhone, setCustomerPhone] = useState(
    booking.customer_phone ?? "",
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
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-300">
        Edit appointment
      </h3>

      <div className="space-y-2">
        <label className="text-[0.7rem] text-neutral-300">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white"
          />
        </label>

        <div className="flex gap-2">
          <label className="flex-1 text-[0.7rem] text-neutral-300">
            Start
            <input
              type="time"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white"
            />
          </label>
          <label className="flex-1 text-[0.7rem] text-neutral-300">
            End
            <input
              type="time"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white"
            />
          </label>
        </div>
      </div>

      <label className="text-[0.7rem] text-neutral-300">
        Customer (from database)
        <select
          value={customerId}
          onChange={(e) => handleSelectCustomer(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white"
        >
          <option value="">
            {loadingCustomers ? "Loading…" : "Select…"}
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {customerLabel(c)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-[0.7rem] text-neutral-300">
        Customer name
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white"
        />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1 text-[0.7rem] text-neutral-300">
          Email
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white"
          />
        </label>
        <label className="flex-1 text-[0.7rem] text-neutral-300">
          Phone
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white"
          />
        </label>
      </div>

      <label className="text-[0.7rem] text-neutral-300">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white"
        />
      </label>

      <label className="text-[0.7rem] text-neutral-300">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white"
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
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}