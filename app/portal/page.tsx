// app/portal/page.tsx
// ✅ Gate portal home: fleet users -> /portal/fleet, customers stay here
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import { resolvePortalMode } from "@/features/portal/lib/resolvePortalMode";

const COPPER = "#C57A4A";

type DB = Database;
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type BookingRow = DB["public"]["Tables"]["bookings"]["Row"];
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];

type PortalMode = "customer" | "fleet";


function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  // ✅ Fix cssConflict warnings: do NOT combine shadow-card with explicit shadow-[...]
  return (
    <div className="rounded-2xl border border-white/12 bg-black/25 p-4 backdrop-blur-md shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
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

function ActionCard({
  href,
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  // ✅ Fix cssConflict warnings: single shadow class only
  return (
    <Link
      href={href}
      className="
        rounded-2xl border border-white/12 bg-black/25 p-4 text-sm font-semibold
        text-neutral-100 backdrop-blur-md shadow-[0_18px_50px_rgba(0,0,0,0.55)]
        transition hover:bg-black/35
      "
    >
      <div className="flex items-center justify-between">
        <span>{title}</span>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COPPER }} />
      </div>
      <div className="mt-1 text-xs font-normal text-neutral-400">{subtitle}</div>
    </Link>
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

function formatWoRef(
  wo: Pick<
    WorkOrderRow,
    "id" | "status" | "created_at" | "invoice_sent_at" | "approval_state"
  > | null,
) {
  if (!wo) return "—";
  const short = wo.id?.slice(0, 8) ?? "—";
  return `#${short}`;
}

export default function PortalHomePage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PortalMode>("customer");

  const [vehiclesCount, setVehiclesCount] = useState<number | null>(null);
  const [nextBookingAt, setNextBookingAt] = useState<string | null>(null);
  const [activeWo, setActiveWo] = useState<
    Pick<
      WorkOrderRow,
      "id" | "status" | "created_at" | "invoice_sent_at" | "approval_state"
    > | null
  >(null);

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
        setVehiclesCount(null);
        setNextBookingAt(null);
        setActiveWo(null);
        setMode("customer");
        setLoading(false);
        return;
      }

      const resolved = await resolvePortalMode(supabase, user.id);

      if (!mounted) return;

      if (resolved === "fleet") {
        setMode("fleet");
        router.replace("/portal/fleet");
        return;
      }

      setMode("customer");

      // Customer lookup
      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle<Pick<CustomerRow, "id">>();

      if (!mounted) return;

      if (custErr || !cust?.id) {
        setVehiclesCount(null);
        setNextBookingAt(null);
        setActiveWo(null);
        setLoading(false);
        return;
      }

      // Vehicles count
      const { count: vCount } = await supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", cust.id);

      // Next booking
      const nowIso = new Date().toISOString();
      const { data: booking } = await supabase
        .from("bookings")
        .select("starts_at")
        .eq("customer_id", cust.id)
        .gte("starts_at", nowIso)
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle<Pick<BookingRow, "starts_at">>();

      // Active request (work order)
      const ACTIVE_STATUSES: Array<WorkOrderRow["status"]> = [
        "awaiting_approval",
        "queued",
        "planned",
        "in_progress",
      ];

      const { data: wo } = await supabase
        .from("work_orders")
        .select("id, status, created_at, invoice_sent_at, approval_state")
        .eq("customer_id", cust.id)
        .in("status", ACTIVE_STATUSES as string[])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<
          Pick<
            WorkOrderRow,
            "id" | "status" | "created_at" | "invoice_sent_at" | "approval_state"
          >
        >();

      if (!mounted) return;
      setVehiclesCount(typeof vCount === "number" ? vCount : null);
      setNextBookingAt(booking?.starts_at ?? null);
      setActiveWo(wo ?? null);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="space-y-6 text-white">
        <div>
          <h1 className="text-2xl font-blackops" style={{ color: COPPER }}>
            Home
          </h1>
          <p className="mt-1 text-sm text-neutral-400">Loading…</p>
        </div>
      </div>
    );
  }

  // If we’re redirecting fleet users, keep customer UI from flashing.
  if (mode === "fleet") {
    return (
      <div className="space-y-6 text-white">
        <div>
          <h1 className="text-2xl font-blackops" style={{ color: COPPER }}>
            Redirecting…
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Taking you to the fleet portal.
          </p>
        </div>
      </div>
    );
  }

  const upcomingValue = nextBookingAt ? formatWhen(nextBookingAt) : "—";
  const vehiclesValue = vehiclesCount == null ? "—" : String(vehiclesCount);
  const activeReqValue = formatWoRef(activeWo);

  const hasInvoice =
    !!activeWo &&
    !!activeWo.invoice_sent_at &&
    (activeWo.status === "ready_to_invoice" || activeWo.status === "invoiced");

  const hasQuote =
    !!activeWo &&
    (activeWo.status === "awaiting_approval" ||
      activeWo.approval_state === "awaiting_customer" ||
      activeWo.approval_state === "requested");

  return (
    <div className="space-y-6 text-white">
      <div>
        <h1 className="text-2xl font-blackops" style={{ color: COPPER }}>
          Customer Portal
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Quick overview — request service, track appointments, and manage your
          vehicles.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard title="Upcoming" value={upcomingValue} sub="Next appointment" />
        <StatCard title="Vehicles" value={vehiclesValue} sub="Saved to your account" />
        <StatCard
          title="Active request"
          value={activeReqValue}
          sub={activeWo?.status ? `Status: ${activeWo.status}` : "No open requests"}
        />
      </div>

      {/* Primary actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ActionCard
          href="/portal/request/when"
          title="Request service"
          subtitle="Pick a time, add details, submit for approval."
        />
        <ActionCard
          href="/portal/vehicles"
          title="Manage vehicles"
          subtitle="Add VIN, plate, mileage, and details."
        />
        <ActionCard
          href="/portal/customer-appointments"
          title="Appointments"
          subtitle="View upcoming and past bookings."
        />
      </div>

      {/* Recent activity + deep links */}
      <div className="rounded-2xl border border-white/12 bg-black/25 p-4 backdrop-blur-md shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-50">
            Recent activity
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Link
              href="/portal/customer-appointments"
              className="text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
              style={{ textDecorationColor: "rgba(197,122,74,0.65)" }}
            >
              View appointments
            </Link>
            <Link
              href="/portal/history"
              className="text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
              style={{ textDecorationColor: "rgba(197,122,74,0.65)" }}
            >
              View history
            </Link>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/20 p-3 text-sm text-neutral-400">
          {hasInvoice && activeWo ? (
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                  Invoice ready
                </div>
                <div className="text-sm text-neutral-100">
                  Work Order {formatWoRef(activeWo)} — sent{" "}
                  {activeWo.invoice_sent_at
                    ? formatWhen(activeWo.invoice_sent_at)
                    : "recently"}
                </div>
              </div>
              <Link
                href={`/portal/invoices/${activeWo.id}`}
                className="mt-2 inline-flex items-center justify-center rounded-full border border-white/18 bg-black/40 px-3 py-1.5 text-xs font-semibold text-neutral-100 transition hover:bg-black/70 sm:mt-0"
              >
                View invoice
              </Link>
            </div>
          ) : hasQuote && activeWo ? (
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                  Quote ready
                </div>
                <div className="text-sm text-neutral-100">
                  Work Order {formatWoRef(activeWo)} — waiting for your approval.
                </div>
              </div>
              <Link
                href={`/portal/quotes/${activeWo.id}`}
                className="mt-2 inline-flex items-center justify-center rounded-full border border-white/18 bg-black/40 px-3 py-1.5 text-xs font-semibold text-neutral-100 transition hover:bg-black/70 sm:mt-0"
              >
                Review quote
              </Link>
            </div>
          ) : (
            "No activity yet. After you submit a request, updates will appear here."
          )}
        </div>
      </div>
    </div>
  );
}