// /app/dashboard/appointments/page.tsx (FULL FILE REPLACEMENT)
//
// Appointments page improvements (UI + code)
//
// UI:
// - ✅ Top card: Shop + stats (single)
// - ✅ 2-column layout (desktop):
//    - Left: Calendar (big)
//    - Right: Requests + Create/Edit side panel (sticky)
// - ✅ Create/Edit is a side panel (drawer on mobile, sticky panel on desktop)
// - ✅ Search filters BOTH Requests + This week list
// - ✅ Pending requests look “actionable” (subtle highlight)
// - ✅ Approve/Decline first; Edit/Delete tucked into “…” menu
// - ✅ Newer theme: border-white/10, divide-white/10, bg-black/40, copper glow
//
// Code:
// - ✅ Big bug fixed: EditForm time fields are NO LONGER UTC-shifted
// - ✅ Abort-safe bookings fetch (prevents race when switching shop/week fast)
// - ✅ Supabase client created once
// - ✅ Adds list tabs: Pending / Confirmed / Cancelled / All
// - ✅ No `any`

"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

/* ----------------------------- date helpers ----------------------------- */

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}

function toLocalTimeInput(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}


/* ----------------------------- ui helpers ----------------------------- */

const COPPER_FOCUS =
  "focus:border-[rgba(184,115,51,0.55)] focus:ring-1 focus:ring-[rgba(184,115,51,0.25)]";

function cardClass() {
  return [
    "rounded-2xl border border-white/10",
    "bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.08),rgba(2,6,23,0.92))]",
    "shadow-[0_18px_45px_rgba(0,0,0,0.75)]",
    "backdrop-blur-xl",
    "p-4",
  ].join(" ");
}

function fieldClass() {
  return [
    "mt-1 w-full rounded-md",
    "border border-white/10 bg-black/40",
    "px-2 py-2 text-sm text-white outline-none",
    COPPER_FOCUS,
  ].join(" ");
}

function subtleButtonClass() {
  return [
    "rounded-md border border-white/10 bg-black/30",
    "px-2 py-1 text-xs text-white/90",
    "hover:bg-black/45",
    COPPER_FOCUS,
  ].join(" ");
}

function pillClass(status?: string | null) {
  const s = (status || "pending").toLowerCase();
  if (s === "confirmed")
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  if (s === "cancelled")
    return "border-red-500/25 bg-red-500/10 text-red-200";
  return "border-orange-500/25 bg-orange-500/10 text-orange-200";
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function customerLabel(c: CustomerRow): string {
  const rec = c as unknown as Record<string, unknown>;
  const first = safeString(rec["first_name"]);
  const last = safeString(rec["last_name"]);
  const full = safeString(rec["full_name"]) || safeString(rec["name"]);
  const name = full || `${first} ${last}`.trim() || safeString(rec["email"]) || "Customer";
  const phone = safeString(rec["phone"]) || safeString(rec["mobile"]);
  return phone ? `${name} (${phone})` : name;
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function bookingSearchBlob(b: Booking): string {
  return normalizeText(
    [
      b.customer_name ?? "",
      b.customer_email ?? "",
      b.customer_phone ?? "",
      b.notes ?? "",
      b.status ?? "",
      b.starts_at ?? "",
      b.ends_at ?? "",
    ].join(" "),
  );
}

function formatRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const start = s.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const end = e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${start} – ${end}`;
}

type ListTab = "pending" | "confirmed" | "cancelled" | "all";
type PanelMode = "create" | "edit" | null;

function statusOf(b: Booking): "pending" | "confirmed" | "cancelled" | "other" {
  const s = (b.status || "pending").toLowerCase();
  if (s === "pending") return "pending";
  if (s === "confirmed") return "confirmed";
  if (s === "cancelled") return "cancelled";
  return "other";
}

/* ----------------------------- page ----------------------------- */

export default function PortalAppointmentsPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const search = useSearchParams();
  const router = useRouter();

  const [shops, setShops] = useState<ShopRow[]>([]);
  const [shopSlug, setShopSlug] = useState<string>(search.get("shop") || "");

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfToday());
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [creatingDate, setCreatingDate] = useState<string | null>(null);

  const [query, setQuery] = useState<string>("");
  const [listTab, setListTab] = useState<ListTab>("all");

  const bookingsAbortRef = useRef<AbortController | null>(null);

  // "..." menu state
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuOpenFor) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (menuRef.current && menuRef.current.contains(t)) return;
      setMenuOpenFor(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpenFor]);

  // load shops
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("id,name,slug,accepts_online_booking")
        .eq("accepts_online_booking", true)
        .order("name", { ascending: true });

      if (!mounted) return;

      if (error) {
        // eslint-disable-next-line no-console
        console.error(error);
        toast.error("Unable to load shops.");
        return;
      }

      const rows = (data ?? []) as ShopRow[];
      setShops(rows);

      if (!shopSlug && rows.length > 0) {
        const first = rows[0].slug as string;
        setShopSlug(first);
        router.replace(`/dashboard/appointments?shop=${encodeURIComponent(first)}`);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [supabase, router, shopSlug]);

  const selectedShop = useMemo(
    () => shops.find((s) => (s.slug as string | null) === shopSlug) ?? null,
    [shops, shopSlug],
  );

  // load customers for selected shop
  useEffect(() => {
    if (!selectedShop) return;

    let mounted = true;

    (async () => {
      setLoadingCustomers(true);
      try {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("shop_id", selectedShop.id)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true });

        if (!mounted) return;

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
        if (mounted) setLoadingCustomers(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [supabase, selectedShop]);

  const refreshBookings = useCallback(async (slug: string, ws: Date, we: Date) => {
    if (!slug) return;

    bookingsAbortRef.current?.abort();
    const ac = new AbortController();
    bookingsAbortRef.current = ac;

    setLoadingBookings(true);
    try {
      const start = isoDate(ws);
      const end = isoDate(we);

      const res = await fetch(
        `/api/portal/bookings?shop=${encodeURIComponent(slug)}&start=${start}&end=${end}`,
        { cache: "no-store", signal: ac.signal },
      );

      if (!res.ok) throw new Error("Failed to load appointments.");
      const j = (await res.json().catch(() => [])) as Booking[];
      setBookings(j ?? []);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error("Failed to load appointments.");
    } finally {
      setLoadingBookings(false);
    }
  }, []);

  // fetch bookings for week
  useEffect(() => {
    if (!shopSlug) return;
    void refreshBookings(shopSlug, weekStart, weekEnd);
    return () => bookingsAbortRef.current?.abort();
  }, [shopSlug, weekStart, weekEnd, refreshBookings]);

  // derived groups
  const pending = useMemo(() => bookings.filter((b) => statusOf(b) === "pending"), [bookings]);
  const confirmed = useMemo(() => bookings.filter((b) => statusOf(b) === "confirmed"), [bookings]);
  const cancelled = useMemo(() => bookings.filter((b) => statusOf(b) === "cancelled"), [bookings]);

  const totalForWeek = bookings.length;

  // search filter across all lists
  const filteredBookings = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return bookings;
    return bookings.filter((b) => bookingSearchBlob(b).includes(q));
  }, [bookings, query]);

  const filteredPending = useMemo(() => {
    const q = normalizeText(query);
    const base = pending;
    if (!q) return base;
    return base.filter((b) => bookingSearchBlob(b).includes(q));
  }, [pending, query]);

  const filteredListByTab = useMemo(() => {
    const base =
      listTab === "pending"
        ? filteredBookings.filter((b) => statusOf(b) === "pending")
        : listTab === "confirmed"
          ? filteredBookings.filter((b) => statusOf(b) === "confirmed")
          : listTab === "cancelled"
            ? filteredBookings.filter((b) => statusOf(b) === "cancelled")
            : filteredBookings;

    return base
      .slice()
      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  }, [filteredBookings, listTab]);

  function openCreate(dayIso: string) {
    setCreatingDate(dayIso);
    setEditing(null);
    setPanelMode("create");
  }

  function openEdit(b: Booking) {
    setEditing(b);
    setCreatingDate(null);
    setPanelMode("edit");
  }

  function closePanel() {
    setPanelMode(null);
    setEditing(null);
    setCreatingDate(null);
  }

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

      const j = (await res.json().catch(() => ({}))) as {
        booking?: Booking;
        error?: string;
      };

      if (!res.ok || !j.booking) throw new Error(j?.error || "Unable to create appointment.");

      toast.success("Appointment created.");
      closePanel();
      await refreshBookings(shopSlug, weekStart, weekEnd);
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
      closePanel();
      await refreshBookings(shopSlug, weekStart, weekEnd);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Update failed";
      toast.error(message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this appointment?")) return;
    try {
      const res = await fetch(`/api/portal/bookings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed.");
      toast.success("Appointment deleted.");
      setBookings((prev) => prev.filter((b) => b.id !== id));
      if (editing?.id === id) closePanel();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Delete failed";
      toast.error(message);
    }
  }

  async function approveBooking(b: Booking) {
    await handleUpdate(b.id, { status: "confirmed" });
  }

  async function declineBooking(b: Booking) {
    await handleUpdate(b.id, { status: "cancelled" });
  }

  const weekLabel = useMemo(() => {
    const s = new Date(weekStart);
    const e = new Date(weekEnd);
    const a = s.toLocaleDateString([], { month: "short", day: "numeric" });
    const b = e.toLocaleDateString([], { month: "short", day: "numeric" });
    return `${a} – ${b}`;
  }, [weekStart, weekEnd]);

  return (
    <div className="space-y-6">
      <Toaster position="top-center" />

      <header className="space-y-1">
        <h1 className="text-2xl font-blackops text-orange-500">Appointments</h1>
        <p className="text-sm text-neutral-400">
          Admin / manager view of customer bookings for the week.
        </p>
      </header>

      {/* Top: Shop + Stats + Search */}
      <div className={cardClass()}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="text-[0.7rem] uppercase tracking-[0.12em] text-white/60">
                Shop
              </div>
              <select
                value={shopSlug}
                onChange={(e) => {
                  const slug = e.target.value;
                  setShopSlug(slug);
                  router.replace(`/dashboard/appointments?shop=${encodeURIComponent(slug)}`);
                  closePanel();
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

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2">
                <div className="text-[0.65rem] uppercase tracking-[0.13em] text-white/55">
                  Week
                </div>
                <div className="text-sm font-semibold text-white/90">{weekLabel}</div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2">
                <div className="text-[0.65rem] uppercase tracking-[0.13em] text-white/55">
                  This week
                </div>
                <div className="text-sm font-semibold text-white/90">
                  {totalForWeek} booking{totalForWeek === 1 ? "" : "s"}
                </div>
              </div>

              <div className="rounded-xl border border-orange-500/20 bg-orange-950/10 px-3 py-2">
                <div className="text-[0.65rem] uppercase tracking-[0.13em] text-orange-200/80">
                  Requests
                </div>
                <div className="text-sm font-semibold text-orange-100">{pending.length}</div>
              </div>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-3 py-2">
                <div className="text-[0.65rem] uppercase tracking-[0.13em] text-emerald-200/80">
                  Confirmed
                </div>
                <div className="text-sm font-semibold text-emerald-100">{confirmed.length}</div>
              </div>

              <div className="rounded-xl border border-red-500/20 bg-red-950/10 px-3 py-2">
                <div className="text-[0.65rem] uppercase tracking-[0.13em] text-red-200/80">
                  Cancelled
                </div>
                <div className="text-sm font-semibold text-red-100">{cancelled.length}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="w-full sm:w-[320px]">
              <label className="text-[0.7rem] uppercase tracking-[0.12em] text-white/60">
                Search
              </label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={fieldClass()}
                placeholder="Name, email, phone, notes…"
              />
            </div>

            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date(weekStart);
                  d.setDate(d.getDate() - 7);
                  setWeekStart(d);
                  closePanel();
                }}
              >
                ← Prev
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setWeekStart(startOfToday());
                  closePanel();
                }}
              >
                Today
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date(weekStart);
                  d.setDate(d.getDate() + 7);
                  setWeekStart(d);
                  closePanel();
                }}
              >
                Next →
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* Left: Calendar big */}
        <div className={cardClass()}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/95">Weekly calendar</h2>
            {loadingBookings ? (
              <span className="text-[0.75rem] text-white/60">Loading…</span>
            ) : null}
          </div>

          <div className="overflow-x-auto pb-2">
            <WeeklyCalendar
              weekStart={weekStart}
              bookings={filteredBookings}
              onSelectDay={(dayIso) => openCreate(dayIso)}
              onSelectBooking={(b) => openEdit(b)}
              loading={loadingBookings}
            />
          </div>

          <p className="mt-3 text-[0.75rem] text-white/55">
            Click a day to create. Click an appointment to edit.
          </p>
        </div>

        {/* Right: Sticky Requests + Panel */}
        <div className="lg:sticky lg:top-6 space-y-6">
          {/* Requests (pending) */}
          <div className={cardClass()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white/95">
                Requests (pending)
              </h2>
              <div className="text-[0.75rem] text-white/60">
                {filteredPending.length}
              </div>
            </div>

            {filteredPending.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/30 p-3 text-sm text-white/60">
                No pending requests{query.trim() ? " matching your search." : " for this week."}
              </div>
            ) : (
              <ul className="divide-y divide-white/10">
                {filteredPending
                  .slice()
                  .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
                  .map((b) => (
                    <li
                      key={b.id}
                      className={[
                        "py-3 text-sm",
                        // subtle "actionable" highlight
                        "rounded-xl px-2 -mx-2",
                        "bg-orange-500/[0.04] hover:bg-orange-500/[0.07]",
                      ].join(" ")}
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium text-white/95">
                              {b.customer_name || "Customer"}
                            </div>
                            <span
                              className={
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] uppercase tracking-[0.14em] " +
                                pillClass(b.status)
                              }
                            >
                              {b.status || "pending"}
                            </span>
                          </div>

                          <div className="mt-0.5 text-[0.75rem] text-white/65">
                            {formatRange(b.starts_at, b.ends_at)}
                          </div>

                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.75rem] text-white/55">
                            {b.customer_phone ? <span>{b.customer_phone}</span> : null}
                            {b.customer_email ? <span>{b.customer_email}</span> : null}
                          </div>

                          {b.notes ? (
                            <div className="mt-1 text-[0.75rem] text-white/55">
                              {b.notes}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            size="xs"
                            className="font-semibold"
                            onClick={() => void approveBooking(b)}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            className="border-red-500/40 text-red-200 hover:bg-red-900/20"
                            onClick={() => void declineBooking(b)}
                          >
                            Decline
                          </Button>

                          {/* "..." menu */}
                          <div className="relative" ref={menuOpenFor === b.id ? menuRef : undefined}>
                            <button
                              type="button"
                              className={subtleButtonClass()}
                              onClick={() => setMenuOpenFor((prev) => (prev === b.id ? null : b.id))}
                              aria-label="More actions"
                            >
                              …
                            </button>

                            {menuOpenFor === b.id ? (
                              <div className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-white/10 bg-black/80 shadow-[0_18px_45px_rgba(0,0,0,0.75)] backdrop-blur-xl">
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm text-white/90 hover:bg-white/5"
                                  onClick={() => {
                                    setMenuOpenFor(null);
                                    openEdit(b);
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/10"
                                  onClick={() => {
                                    setMenuOpenFor(null);
                                    void handleDelete(b.id);
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* Create / Edit panel (desktop card) */}
          <div className={cardClass() + " hidden lg:block"}>
            {panelMode === "edit" && editing ? (
              <EditForm
                booking={editing}
                customers={customers}
                loadingCustomers={loadingCustomers}
                onCancel={closePanel}
                onDelete={() => void handleDelete(editing.id)}
                onSave={(patch) => void handleUpdate(editing.id, patch)}
              />
            ) : panelMode === "create" ? (
              <CreateForm
                defaultDate={creatingDate ?? isoDate(weekStart)}
                customers={customers}
                loadingCustomers={loadingCustomers}
                onCancel={closePanel}
                onSubmit={handleCreate}
              />
            ) : (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-white/95">
                  Create / Edit
                </h3>
                <p className="text-sm text-white/60">
                  Select a day (create) or click an appointment (edit).
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="font-semibold"
                  onClick={() => openCreate(isoDate(weekStart))}
                >
                  Create appointment
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: This week list with tabs */}
      <div className={cardClass()}>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-white/95">
            This week ({filteredBookings.length})
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <TabButton active={listTab === "all"} onClick={() => setListTab("all")}>
              All
            </TabButton>
            <TabButton active={listTab === "pending"} onClick={() => setListTab("pending")}>
              Pending
            </TabButton>
            <TabButton active={listTab === "confirmed"} onClick={() => setListTab("confirmed")}>
              Confirmed
            </TabButton>
            <TabButton active={listTab === "cancelled"} onClick={() => setListTab("cancelled")}>
              Cancelled
            </TabButton>
          </div>
        </div>

        {loadingBookings ? (
          <p className="text-sm text-white/60">Fetching appointments…</p>
        ) : filteredListByTab.length === 0 ? (
          <p className="text-sm text-white/60">
            No appointments{query.trim() ? " matching your search." : " for this week."}
          </p>
        ) : (
          <ul className="divide-y divide-white/10">
            {filteredListByTab.map((b) => (
              <li key={b.id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-white/95">
                      {b.customer_name || "Customer"}
                    </div>
                    <span
                      className={
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] uppercase tracking-[0.14em] " +
                        pillClass(b.status)
                      }
                    >
                      {b.status || "pending"}
                    </span>
                  </div>

                  <div className="text-[0.75rem] text-white/65">
                    {formatRange(b.starts_at, b.ends_at)}
                  </div>

                  {b.notes ? (
                    <div className="mt-1 text-[0.75rem] text-white/55">{b.notes}</div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {statusOf(b) === "pending" ? (
                    <>
                      <Button type="button" size="xs" onClick={() => void approveBooking(b)}>
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="border-red-500/40 text-red-200 hover:bg-red-900/20"
                        onClick={() => void declineBooking(b)}
                      >
                        Decline
                      </Button>
                    </>
                  ) : null}

                  <Button type="button" size="xs" variant="outline" onClick={() => openEdit(b)}>
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

      {/* Mobile drawer */}
      {panelMode ? (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-40 bg-black/70"
            onClick={closePanel}
            role="button"
            tabIndex={-1}
            aria-label="Close panel overlay"
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-auto rounded-t-3xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.10),rgba(2,6,23,0.98))] p-4 shadow-[0_-18px_45px_rgba(0,0,0,0.75)] backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-white/95">
                {panelMode === "edit" ? "Edit appointment" : "Create appointment"}
              </div>
              <Button type="button" size="xs" variant="outline" onClick={closePanel}>
                Close
              </Button>
            </div>

            {panelMode === "edit" && editing ? (
              <EditForm
                booking={editing}
                customers={customers}
                loadingCustomers={loadingCustomers}
                onCancel={closePanel}
                onDelete={() => void handleDelete(editing.id)}
                onSave={(patch) => void handleUpdate(editing.id, patch)}
              />
            ) : (
              <CreateForm
                defaultDate={creatingDate ?? isoDate(weekStart)}
                customers={customers}
                loadingCustomers={loadingCustomers}
                onCancel={closePanel}
                onSubmit={handleCreate}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------- Small components ----------------------------- */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs font-semibold",
        "transition",
        active
          ? "border-orange-500/35 bg-orange-500/10 text-orange-100"
          : "border-white/10 bg-black/30 text-white/75 hover:bg-black/45",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Forms                                                                      */
/* -------------------------------------------------------------------------- */

function CreateForm({
  defaultDate,
  customers,
  loadingCustomers,
  onCancel,
  onSubmit,
}: {
  defaultDate: string;
  customers: CustomerRow[];
  loadingCustomers: boolean;
  onCancel: () => void;
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
      <h3 className="text-sm font-semibold text-white/95">Create appointment</h3>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-white/70">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={fieldClass()}
          />
        </label>

        <div className="flex gap-2">
          <label className="flex-1 text-xs text-white/70">
            Start
            <input
              type="time"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className={fieldClass()}
            />
          </label>
          <label className="flex-1 text-xs text-white/70">
            End
            <input
              type="time"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className={fieldClass()}
            />
          </label>
        </div>
      </div>

      <label className="text-xs text-white/70">
        Customer (from database)
        <select
          value={customerId}
          onChange={(e) => handleSelectCustomer(e.target.value)}
          className={fieldClass()}
        >
          <option value="">{loadingCustomers ? "Loading…" : "Select…"}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {customerLabel(c)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-white/70">
        Customer name
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className={fieldClass()}
          placeholder="John Smith"
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-white/70">
          Email
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className={fieldClass()}
          />
        </label>
        <label className="text-xs text-white/70">
          Phone
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className={fieldClass()}
          />
        </label>
      </div>

      <label className="text-xs text-white/70">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={fieldClass()}
        />
      </label>

      <div className="flex gap-2">
        <Button type="submit" size="sm" className="font-semibold">
          Save appointment
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  booking,
  customers,
  loadingCustomers,
  onCancel,
  onDelete,
  onSave,
}: {
  booking: Booking;
  customers: CustomerRow[];
  loadingCustomers: boolean;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (patch: Partial<Booking>) => void;
}) {
  // ✅ FIX: Use LOCAL time fields (no UTC slicing)
  const start = useMemo(() => new Date(booking.starts_at), [booking.starts_at]);
  const end = useMemo(() => new Date(booking.ends_at), [booking.ends_at]);

  const [date, setDate] = useState<string>(() => booking.starts_at.slice(0, 10));
  const [startsAt, setStartsAt] = useState<string>(() => toLocalTimeInput(start));
  const [endsAt, setEndsAt] = useState<string>(() => toLocalTimeInput(end));

  useEffect(() => {
    // when booking changes
    setDate(booking.starts_at.slice(0, 10));
    setStartsAt(toLocalTimeInput(new Date(booking.starts_at)));
    setEndsAt(toLocalTimeInput(new Date(booking.ends_at)));
  }, [booking.id, booking.starts_at, booking.ends_at]);

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
      <h3 className="text-sm font-semibold text-white/95">Edit appointment</h3>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-white/70">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={fieldClass()}
          />
        </label>

        <div className="flex gap-2">
          <label className="flex-1 text-xs text-white/70">
            Start
            <input
              type="time"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className={fieldClass()}
            />
          </label>
          <label className="flex-1 text-xs text-white/70">
            End
            <input
              type="time"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className={fieldClass()}
            />
          </label>
        </div>
      </div>

      <label className="text-xs text-white/70">
        Customer (from database)
        <select
          value={customerId}
          onChange={(e) => handleSelectCustomer(e.target.value)}
          className={fieldClass()}
        >
          <option value="">{loadingCustomers ? "Loading…" : "Select…"}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {customerLabel(c)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-white/70">
        Customer name
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className={fieldClass()}
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-white/70">
          Email
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className={fieldClass()}
          />
        </label>
        <label className="text-xs text-white/70">
          Phone
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className={fieldClass()}
          />
        </label>
      </div>

      <label className="text-xs text-white/70">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={fieldClass()}
        />
      </label>

      <label className="text-xs text-white/70">
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass()}>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="font-semibold">
          Save changes
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-red-300 hover:bg-red-900/25"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-[0.75rem] text-white/60">
        <div className="font-semibold text-white/80">Current time window</div>
        <div className="mt-1">{formatRange(booking.starts_at, booking.ends_at)}</div>
        <div className="mt-2 text-white/55">
          Tip: If times looked “shifted” before, that was UTC slicing. This form now uses local time.
        </div>
      </div>
    </form>
  );
}