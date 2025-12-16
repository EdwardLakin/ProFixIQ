// app/portal/appointments/page.tsx
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

function cardClass() {
  return "rounded-2xl border border-neutral-800/70 bg-neutral-950/45 p-4 backdrop-blur-md";
}

function fieldClass() {
  return "mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950/60 px-2 py-1 text-sm text-white outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/40";
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function customerLabel(c: CustomerRow): string {
  const rec = c as unknown as Record<string, unknown>;

  const first = safeString(rec["first_name"]);
  const last = safeString(rec["last_name"]);
  const full = safeString(rec["full_name"]) || safeString(rec["name"]);
  const name =
    full || `${first} ${last}`.trim() || safeString(rec["email"]) || "Customer";

  const phone = safeString(rec["phone"]) || safeString(rec["mobile"]);
  return phone ? `${name} (${phone})` : name;
}

export default function PortalAppointmentsPage() {
  const supabase = createClientComponentClient<Database>();
  const search = useSearchParams();
  const router = useRouter();

  const [shops, setShops] = useState<ShopRow[]>([]);
  const [shopSlug, setShopSlug] = useState<string>(search.get("shop") || "");

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfToday());

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

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
        router.replace(`/portal/appointments?shop=${encodeURIComponent(first)}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedShop = useMemo(
    () => shops.find((s) => (s.slug as string | null) === shopSlug) ?? null,
    [shops, shopSlug],
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
          `/api/portal/bookings?shop=${encodeURIComponent(shopSlug)}&start=${start}&end=${end}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("Failed to load appointments.");
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

      setBookings((prev) => [...prev, j.booking as Booking]);

      toast.success("Appointment created.");
      setCreatingDate(null);

      await refreshBookings(shopSlug, weekStart, weekEnd, setBookings);
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
      await refreshBookings(shopSlug, weekStart, weekEnd, setBookings);
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

  const totalForWeek = useMemo(() => bookings.length, [bookings]);

  return (
    <div className="space-y-6">
      <Toaster position="top-center" />

      <header className="space-y-1">
        <h1 className="text-2xl font-blackops text-orange-500">Appointments</h1>
        <p className="text-sm text-neutral-400">
          Admin / manager view of customer bookings for the week.
        </p>
      </header>

      {/* Shop selector */}
      <div className={cardClass()}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400">
              Shop
            </div>
            <select
              value={shopSlug}
              onChange={(e) => {
                const slug = e.target.value;
                setShopSlug(slug);
                router.replace(`/portal/appointments?shop=${encodeURIComponent(slug)}`);
              }}
              className={fieldClass() + " min-w-[220px]"}
            >
              {shops.map((s) => (
                <option key={s.slug as string} value={s.slug as string}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-neutral-800/70 bg-neutral-950/50 px-3 py-2">
            <div className="text-[0.65rem] uppercase tracking-[0.13em] text-neutral-500">
              This week
            </div>
            <div className="text-sm font-semibold text-neutral-100">
              {totalForWeek} booking{totalForWeek === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className={cardClass()}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-neutral-50">Weekly calendar</h2>
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
            <Button type="button" variant="outline" size="xs" onClick={() => setWeekStart(startOfToday())}>
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

        <p className="mt-3 text-[0.75rem] text-neutral-500">
          Click a day to create. Click an appointment to edit.
        </p>
      </div>

      {/* Create / Edit */}
      <div className={cardClass()}>
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

      {/* List */}
      <div className={cardClass()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-50">
            Appointments this week ({bookings.length})
          </h2>
          {loadingBookings && <span className="text-[0.75rem] text-neutral-400">Loading…</span>}
        </div>

        {loadingBookings ? (
          <p className="text-sm text-neutral-400">Fetching appointments…</p>
        ) : bookings.length === 0 ? (
          <p className="text-sm text-neutral-400">No appointments for this week.</p>
        ) : (
          <ul className="divide-y divide-neutral-800/70">
            {bookings
              .slice()
              .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
              .map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-neutral-50">{b.customer_name || "Customer"}</div>
                    <div className="text-[0.75rem] text-neutral-400">
                      {new Date(b.starts_at).toLocaleString()} –{" "}
                      {new Date(b.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    {b.notes ? <div className="mt-1 text-[0.75rem] text-neutral-500">{b.notes}</div> : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button type="button" size="xs" variant="outline" onClick={() => setEditing(b)}>
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
  );
}

async function refreshBookings(
  shopSlug: string,
  weekStart: Date,
  weekEnd: Date,
  setBookings: (b: Booking[]) => void,
) {
  const start = isoDate(weekStart);
  const end = isoDate(weekEnd);
  const res = await fetch(
    `/api/portal/bookings?shop=${encodeURIComponent(shopSlug)}&start=${start}&end=${end}`,
    { cache: "no-store" },
  );
  const refreshed = (await res.json().catch(() => [])) as Booking[];
  setBookings(refreshed ?? []);
}

/* -------------------------------------------------------------------------- */
/* Forms                                                                      */
/* -------------------------------------------------------------------------- */

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

    const rec = c as unknown as Record<string, unknown>;
    const full = safeString(rec["full_name"]) || safeString(rec["name"]);
    const first = safeString(rec["first_name"]);
    const last = safeString(rec["last_name"]);
    const name = full || `${first} ${last}`.trim();

    setCustomerName(name || "");
    setCustomerEmail(safeString(rec["email"]) || safeString(rec["contact_email"]));
    setCustomerPhone(safeString(rec["phone"]) || safeString(rec["mobile"]));
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
      <h3 className="text-sm font-semibold text-neutral-50">Create appointment</h3>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-neutral-300">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass()} />
        </label>

        <div className="flex gap-2">
          <label className="flex-1 text-xs text-neutral-300">
            Start
            <input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={fieldClass()} />
          </label>
          <label className="flex-1 text-xs text-neutral-300">
            End
            <input type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={fieldClass()} />
          </label>
        </div>
      </div>

      <label className="text-xs text-neutral-300">
        Customer (from database)
        <select value={customerId} onChange={(e) => handleSelectCustomer(e.target.value)} className={fieldClass()}>
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
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={fieldClass()} placeholder="John Smith" />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-neutral-300">
          Email
          <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className={fieldClass()} />
        </label>
        <label className="text-xs text-neutral-300">
          Phone
          <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className={fieldClass()} />
        </label>
      </div>

      <label className="text-xs text-neutral-300">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={fieldClass()} />
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

  const [customerId, setCustomerId] = useState<string>(booking.customer_id ?? "");
  const [customerName, setCustomerName] = useState(booking.customer_name ?? "");
  const [customerEmail, setCustomerEmail] = useState(booking.customer_email ?? "");
  const [customerPhone, setCustomerPhone] = useState(booking.customer_phone ?? "");
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [status, setStatus] = useState(booking.status ?? "pending");

  const handleSelectCustomer = (id: string) => {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (!c) return;

    const rec = c as unknown as Record<string, unknown>;
    const full = safeString(rec["full_name"]) || safeString(rec["name"]);
    const first = safeString(rec["first_name"]);
    const last = safeString(rec["last_name"]);
    const name = full || `${first} ${last}`.trim();

    setCustomerName(name || "");
    setCustomerEmail(safeString(rec["email"]) || safeString(rec["contact_email"]));
    setCustomerPhone(safeString(rec["phone"]) || safeString(rec["mobile"]));
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
      <h3 className="text-sm font-semibold text-neutral-50">Edit appointment</h3>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-neutral-300">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass()} />
        </label>

        <div className="flex gap-2">
          <label className="flex-1 text-xs text-neutral-300">
            Start
            <input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={fieldClass()} />
          </label>
          <label className="flex-1 text-xs text-neutral-300">
            End
            <input type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={fieldClass()} />
          </label>
        </div>
      </div>

      <label className="text-xs text-neutral-300">
        Customer (from database)
        <select value={customerId} onChange={(e) => handleSelectCustomer(e.target.value)} className={fieldClass()}>
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
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={fieldClass()} />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-neutral-300">
          Email
          <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className={fieldClass()} />
        </label>
        <label className="text-xs text-neutral-300">
          Phone
          <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className={fieldClass()} />
        </label>
      </div>

      <label className="text-xs text-neutral-300">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={fieldClass()} />
      </label>

      <label className="text-xs text-neutral-300">
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass()}>
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