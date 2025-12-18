"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Toaster, toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import LinkButton from "@shared/components/ui/LinkButton";
import { Button } from "@shared/components/ui/Button";

type DB = Database;

type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type ShopRow = Pick<DB["public"]["Tables"]["shops"]["Row"], "id" | "slug">;

type PortalBooking = {
  id: string;
  shop_slug?: string | null;

  starts_at: string; // ISO
  ends_at: string; // ISO

  customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;

  notes?: string | null;
  status?: string | null;
};


function cardClass() {
  return "rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-card";
}

function pillClass(status?: string | null) {
  const s = (status || "pending").toLowerCase();
  if (s === "confirmed")
    return "border-emerald-500/30 bg-emerald-900/15 text-emerald-200";
  if (s === "cancelled")
    return "border-red-500/30 bg-red-900/15 text-red-200";
  return "border-white/12 bg-white/5 text-neutral-200";
}

function fmtRange(startsAtIso: string, endsAtIso: string) {
  const start = new Date(startsAtIso);
  const end = new Date(endsAtIso);

  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const startTime = start.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return { date, time: `${startTime} – ${endTime}` };
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export default function PortalCustomerAppointmentsPage() {
  const supabase = createClientComponentClient<DB>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);

  const [shopSlug, setShopSlug] = useState<string>("");
  const [bookings, setBookings] = useState<PortalBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr || !user) {
        toast.error("Please sign in to view appointments.");
        router.replace("/portal/auth/sign-in");
        return;
      }

      const { data: c, error: cErr } = await supabase
        .from("customers")
        .select("id,user_id,shop_id,first_name,last_name,email,phone")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cErr) {
        toast.error(cErr.message);
        setCustomer(null);
        setLoading(false);
        return;
      }

      setCustomer((c ?? null) as CustomerRow | null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!customer?.shop_id) {
        setShopSlug("");
        return;
      }

      const { data, error } = await supabase
        .from("shops")
        .select("id,slug")
        .eq("id", customer.shop_id)
        .maybeSingle<ShopRow>();

      if (cancelled) return;

      if (error) {
        console.error(error);
        toast.error("Unable to load your shop.");
        setShopSlug("");
        return;
      }

      setShopSlug((data?.slug as string) || "");
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, customer?.shop_id]);

  useEffect(() => {
    if (!customer?.id) return;
    if (!shopSlug) return;

    (async () => {
      setLoadingBookings(true);
      try {
        const now = new Date();
        const start = isoDate(addDays(now, -180));
        const end = isoDate(addDays(now, 365));

        const res = await fetch(
          `/api/portal/bookings?shop=${encodeURIComponent(shopSlug)}&start=${encodeURIComponent(
            start,
          )}&end=${encodeURIComponent(end)}`,
          { cache: "no-store" },
        );

        if (!res.ok) throw new Error("Failed to load your appointments.");

        const j = (await res.json().catch(() => [])) as PortalBooking[];
        const all = Array.isArray(j) ? j : [];
        const mine = all.filter((b) => (b.customer_id ?? null) === customer.id);

        setBookings(mine);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load appointments.");
        setBookings([]);
      } finally {
        setLoadingBookings(false);
      }
    })();
  }, [customer?.id, shopSlug]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter(
        (b) =>
          +new Date(b.ends_at) >= now &&
          (b.status || "pending").toLowerCase() !== "cancelled",
      )
      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  }, [bookings]);

  const past = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter(
        (b) =>
          +new Date(b.ends_at) < now ||
          (b.status || "").toLowerCase() === "cancelled",
      )
      .sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
  }, [bookings]);

  async function cancelBooking(id: string) {
    if (!confirm("Cancel this appointment?")) return;

    try {
      const res = await fetch(`/api/portal/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });

      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j?.error || "Cancel failed");

      toast.success("Appointment cancelled.");
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Cancel failed.";
      toast.error(msg);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl">
        <div className={cardClass() + " text-sm text-neutral-200"}>
          Loading your portal…
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <div className={cardClass()}>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            My appointments
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            We couldn’t find your customer profile yet.
          </p>
          <div className="mt-4 flex gap-2">
            <LinkButton href="/portal/profile" variant="outline" size="sm">
              Go to profile
            </LinkButton>
            <LinkButton href="/portal/request/when" size="sm">
              Request service
            </LinkButton>
          </div>
        </div>
      </div>
    );
  }

  if (!shopSlug) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <div className={cardClass()}>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            My appointments
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Your portal account isn’t linked to a shop yet.
          </p>
          <div className="mt-4 flex gap-2">
            <LinkButton href="/portal/profile" variant="outline" size="sm">
              Go to profile
            </LinkButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 text-white">
      <Toaster position="top-center" />

      <header className="space-y-1">
        <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
          My appointments
        </h1>
        <p className="text-xs text-neutral-400">
          Request service, then track your upcoming visits here.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/portal/request/when" size="sm">
          Request service
        </LinkButton>
        <LinkButton href="/portal/history" variant="outline" size="sm">
          View service history
        </LinkButton>
      </div>

      <section className={cardClass()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">
            Upcoming ({upcoming.length})
          </h2>
          {loadingBookings ? (
            <span className="text-[0.75rem] text-neutral-400">Loading…</span>
          ) : null}
        </div>

        {loadingBookings ? (
          <p className="mt-3 text-sm text-neutral-400">Fetching your bookings…</p>
        ) : upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">No upcoming appointments.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {upcoming.map((b) => {
              const { date, time } = fmtRange(b.starts_at, b.ends_at);
              return (
                <li
                  key={b.id}
                  className="rounded-xl border border-white/10 bg-black/35 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-100">
                        {date}
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-300">{time}</div>

                      {b.notes ? (
                        <div className="mt-2 text-xs text-neutral-400">
                          {b.notes}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-1 text-[0.7rem] uppercase tracking-[0.14em] " +
                          pillClass(b.status)
                        }
                      >
                        {b.status || "pending"}
                      </span>

                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => void cancelBooking(b.id)}
                        className="border-red-500/40 text-red-200 hover:bg-red-900/20"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={cardClass()}>
        <h2 className="text-sm font-semibold text-neutral-100">
          Past ({past.length})
        </h2>

        {loadingBookings ? (
          <p className="mt-3 text-sm text-neutral-400">Loading…</p>
        ) : past.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">No past appointments.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {past.slice(0, 25).map((b) => {
              const { date, time } = fmtRange(b.starts_at, b.ends_at);
              return (
                <li
                  key={b.id}
                  className="rounded-xl border border-white/10 bg-black/25 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-100">
                        {date}
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-400">{time}</div>
                    </div>

                    <span
                      className={
                        "inline-flex items-center rounded-full border px-2 py-1 text-[0.7rem] uppercase tracking-[0.14em] " +
                        pillClass(b.status)
                      }
                    >
                      {b.status || "pending"}
                    </span>
                  </div>

                  {b.notes ? (
                    <div className="mt-2 text-xs text-neutral-500">{b.notes}</div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-[0.75rem] text-neutral-500">
        Need to change a time? Cancel and submit a new request.
      </p>
    </div>
  );
}
