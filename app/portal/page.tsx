// app/portal/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COPPER = "#C57A4A";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type WorkOrderRow = Database["public"]["Tables"]["work_orders"]["Row"];

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/25 p-4 backdrop-blur-md shadow-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {title}
      </div>
      <div className="mt-2 text-2xl font-blackops" style={{ color: COPPER }}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-neutral-500">{sub}</div> : null}
    </div>
  );
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatWoRef(wo: Pick<WorkOrderRow, "id" | "status"> | null) {
  if (!wo) return "—";
  const short = wo.id?.slice(0, 8) ?? "—";
  return `#${short}`;
}

export default function PortalHomePage() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [loading, setLoading] = useState(true);
  const [, setCustomer] = useState<Customer | null>(null);

  const [vehiclesCount, setVehiclesCount] = useState<number | null>(null);
  const [nextBookingAt, setNextBookingAt] = useState<string | null>(null);
  const [activeWo, setActiveWo] = useState<Pick<
    WorkOrderRow,
    "id" | "status" | "created_at"
  > | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userErr || !user) {
        setCustomer(null);
        setVehiclesCount(null);
        setNextBookingAt(null);
        setActiveWo(null);
        setLoading(false);
        return;
      }

      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (custErr || !cust) {
        setCustomer(null);
        setVehiclesCount(null);
        setNextBookingAt(null);
        setActiveWo(null);
        setLoading(false);
        return;
      }

      setCustomer(cust as Customer);

      // Vehicles count
      const { count: vCount } = await supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", cust.id);

      // Upcoming booking (next)
      const nowIso = new Date().toISOString();
      const { data: booking } = await supabase
        .from("bookings")
        .select("starts_at")
        .eq("customer_id", cust.id)
        .gte("starts_at", nowIso)
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const b = booking as Pick<BookingRow, "starts_at"> | null;

      // Active request (work order)
      const ACTIVE_STATUSES: WorkOrderRow["status"][] = [
        "awaiting_approval",
        "queued",
        "planned",
        "in_progress",
      ];

      const { data: wo } = await supabase
        .from("work_orders")
        .select("id, status, created_at")
        .eq("customer_id", cust.id)
        .in("status", ACTIVE_STATUSES as string[])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const w = wo as Pick<WorkOrderRow, "id" | "status" | "created_at"> | null;

      if (!mounted) return;
      setVehiclesCount(typeof vCount === "number" ? vCount : null);
      setNextBookingAt(b?.starts_at ?? null);
      setActiveWo(w ?? null);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const upcomingValue = loading
    ? "…"
    : nextBookingAt
      ? formatWhen(nextBookingAt)
      : "—";

  const vehiclesValue = loading
    ? "…"
    : vehiclesCount == null
      ? "—"
      : String(vehiclesCount);

  const activeReqValue = loading ? "…" : formatWoRef(activeWo);

  return (
    <div className="space-y-6 text-white">
      <div>
        <h1 className="text-2xl font-blackops" style={{ color: COPPER }}>
          Home
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Quick overview — request service, track appointments, and manage vehicles.
        </p>
      </div>

      {/* ✅ removed Last visit, added Active request */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard title="Upcoming" value={upcomingValue} sub="Next appointment" />
        <StatCard title="Vehicles" value={vehiclesValue} sub="Saved to your account" />
        <StatCard
          title="Active request"
          value={activeReqValue}
          sub={activeWo?.status ? `Status: ${activeWo.status}` : "No open requests"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/portal/request/when"
          className="rounded-2xl border border-white/12 bg-black/25 p-4 text-sm font-semibold text-neutral-100 backdrop-blur-md shadow-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition hover:bg-black/35"
        >
          <div className="flex items-center justify-between">
            <span>Request service</span>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COPPER }} />
          </div>
          <div className="mt-1 text-xs font-normal text-neutral-400">
            Pick a time, add lines, submit for approval.
          </div>
        </Link>

        <Link
          href="/portal/vehicles"
          className="rounded-2xl border border-white/12 bg-black/25 p-4 text-sm font-semibold text-neutral-100 backdrop-blur-md shadow-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition hover:bg-black/35"
        >
          <div className="flex items-center justify-between">
            <span>Manage vehicles</span>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COPPER }} />
          </div>
          <div className="mt-1 text-xs font-normal text-neutral-400">
            Add VIN, plate, mileage, and details.
          </div>
        </Link>
      </div>

      <div className="rounded-2xl border border-white/12 bg-black/25 p-4 backdrop-blur-md shadow-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-50">Recent activity</h2>
          <Link
            href="/portal/customer-appointments"
            className="text-xs text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
            style={{ textDecorationColor: "rgba(197,122,74,0.65)" }}
          >
            View appointments
          </Link>
        </div>

        <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/20 p-3 text-sm text-neutral-400">
          No activity yet. After you submit a request, updates will appear here.
        </div>
      </div>
    </div>
  );
}