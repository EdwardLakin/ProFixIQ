"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Link from "next/link";

import ShopBoostWidget from "@/features/shared/components/ui/ShopBoostWidget";

type DB = Database;
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];

type CountState = {
  appointments: number | null;
  workOrders: number | null;
  partsRequests: number | null;
};

export default function DashboardPage() {
  const supabase = useMemo(
    () => createClientComponentClient<Database>(),
    [],
  );

  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  const [counts, setCounts] = useState<CountState>({
    appointments: null,
    workOrders: null,
    partsRequests: null,
  });

  // current punched-in job for this user
  const [currentJob, setCurrentJob] = useState<WorkOrderLine | null>(null);
  const [currentJobWorkOrder, setCurrentJobWorkOrder] =
    useState<WorkOrder | null>(null);
  const [currentJobVehicle, setCurrentJobVehicle] =
    useState<Vehicle | null>(null);
  const [loadingCurrentJob, setLoadingCurrentJob] = useState(false);

  // fetch profile + user id
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setUserId(uid);

      if (!uid) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role, shop_id")
        .eq("id", uid)
        .maybeSingle();

      setName(profile?.full_name ?? null);
      setRole(profile?.role ?? null);
      setShopId(profile?.shop_id ?? null);
    })();
  }, [supabase]);

  // fetch the 3 counts
  useEffect(() => {
    (async () => {
      const [appt, wo, parts] = await Promise.all([
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("work_orders")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("parts_requests")
          .select("id", { count: "exact", head: true }),
      ]);

      setCounts({
        appointments: appt.error ? 0 : appt.count ?? 0,
        workOrders: wo.error ? 0 : wo.count ?? 0,
        partsRequests: parts.error ? 0 : parts.count ?? 0,
      });
    })();
  }, [supabase]);

  /* ---------------------------------------------------------------------- */
  /* Current job – job this user is actively punched in on                  */
  /* ---------------------------------------------------------------------- */

  const loadCurrentJob = useCallback(
    async (uid: string | null) => {
      if (!uid) {
        setCurrentJob(null);
        setCurrentJobWorkOrder(null);
        setCurrentJobVehicle(null);
        return;
      }

      setLoadingCurrentJob(true);
      try {
        const { data, error } = await supabase
          .from("work_order_lines")
          .select(
            "id, work_order_id, description, complaint, job_type, punched_in_at, punched_out_at, assigned_to",
          )
          .eq("assigned_to", uid)
          .not("punched_in_at", "is", null)
          .is("punched_out_at", null)
          .order("punched_in_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          // eslint-disable-next-line no-console
          console.error("[Dashboard] current job load error:", error);
          setCurrentJob(null);
          setCurrentJobWorkOrder(null);
          setCurrentJobVehicle(null);
          return;
        }

        const line = (data as WorkOrderLine | null) ?? null;
        setCurrentJob(line);

        if (!line?.work_order_id) {
          setCurrentJobWorkOrder(null);
          setCurrentJobVehicle(null);
          return;
        }

        // related work order
        const { data: wo, error: woErr } = await supabase
          .from("work_orders")
          .select("id, custom_id, vehicle_id")
          .eq("id", line.work_order_id)
          .maybeSingle<WorkOrder>();

        if (woErr) {
          console.error("[Dashboard] current job WO load error:", woErr);
          setCurrentJobWorkOrder(null);
          setCurrentJobVehicle(null);
          return;
        }

        const workOrder = wo ?? null;
        setCurrentJobWorkOrder(workOrder);

        if (workOrder?.vehicle_id) {
          const { data: veh, error: vehErr } = await supabase
            .from("vehicles")
            .select("id, year, make, model, license_plate")
            .eq("id", workOrder.vehicle_id)
            .maybeSingle<Vehicle>();

          if (vehErr) {
            console.error("[Dashboard] current job vehicle load error:", vehErr);
            setCurrentJobVehicle(null);
          } else {
            setCurrentJobVehicle(veh ?? null);
          }
        } else {
          setCurrentJobVehicle(null);
        }
      } finally {
        setLoadingCurrentJob(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    void loadCurrentJob(userId);
  }, [userId, loadCurrentJob]);

  const firstName = name ? name.split(" ")[0] : null;

  const isTechRole =
    role === "tech" || role === "mechanic" || role === "technician";

  // Who can see shop-level health snapshot on dashboard
  const canViewShopHealth =
    role === "owner" || role === "admin" || role === "advisor" || role === "manager";

  return (
    <div className="relative space-y-8 fade-in">
      {/* soft gradient background for this page (extra metal wash) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.95),#020617_70%)]"
      />

      {/* welcome panel */}
      <section className="flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-r from-black/80 via-slate-950/90 to-black/80 px-5 py-4 shadow-[0_22px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {firstName ? `Welcome back, ${firstName} 👋` : "Welcome 👋"}
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Here’s a quick view of what matters today in your shop.
          </p>
        </div>
      </section>

      {/* Shop Boost / Health Snapshot (owner/admin/advisor/manager) */}
      <ShopBoostWidget shopId={shopId} canViewShopHealth={canViewShopHealth} />

      {/* active job pill – only for tech/mechanic roles */}
      {isTechRole && (
        <section>
          <ActiveJobCard
            loading={loadingCurrentJob}
            job={currentJob}
            workOrder={currentJobWorkOrder}
            vehicle={currentJobVehicle}
          />
        </section>
      )}

      {/* overview cards */}
      <section className="grid gap-4 md:grid-cols-4">
        <OverviewCard
          title="Today’s appointments"
          value={counts.appointments === null ? "…" : String(counts.appointments)}
          href="/portal/appointments"
        />
        <OverviewCard
          title="Open work orders"
          value={counts.workOrders === null ? "…" : String(counts.workOrders)}
          href="/work-orders/view"
        />
        <OverviewCard
          title="Parts requests"
          value={counts.partsRequests === null ? "…" : String(counts.partsRequests)}
          href="/parts/requests"
        />
        <OverviewCard title="Team chat" value="Open" href="/chat" />
      </section>

      {/* quick actions */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <QuickButton href="/work-orders/create?autostart=1">New work order</QuickButton>
          <QuickButton href="/portal/appointments">Appointments</QuickButton>
          <QuickButton href="/ai/assistant">AI assistant</QuickButton>
          {role === "owner" || role === "admin" ? (
            <QuickButton href="/dashboard/owner/reports">Reports</QuickButton>
          ) : null}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Active Job Card                                                          */
/* ------------------------------------------------------------------------ */

function ActiveJobCard({
  loading,
  job,
  workOrder,
  vehicle,
}: {
  loading: boolean;
  job: WorkOrderLine | null;
  workOrder: WorkOrder | null;
  vehicle: Vehicle | null;
}) {
  if (loading) {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-r from-black/85 via-slate-950/95 to-black/85 px-4 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.95)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
              Active job
            </p>
            <p className="mt-1 text-sm text-neutral-300">Checking…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!job || !workOrder) {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-r from-black/85 via-slate-950/95 to-black/85 px-4 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.95)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              Active job
            </p>
            <p className="mt-1 text-sm text-neutral-400">No active job punch.</p>
          </div>
        </div>
      </div>
    );
  }

  const jobLabel =
    job.description || job.complaint || String(job.job_type ?? "Job in progress");

  const vehicleLabel = vehicle
    ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`
        .trim()
        .replace(/\s+/g, " ")
    : null;

  const woLabel = workOrder.custom_id || workOrder.id.slice(0, 8);

  // include line id so the job page can focus that line
  const href = `/work-orders/${workOrder.id}?focus=${job.id}`;

  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-2xl border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-black/85 via-slate-950/95 to-black/85 px-4 py-3 shadow-[0_24px_45px_rgba(0,0,0,0.95),0_0_35px_rgba(249,115,22,0.55)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),transparent_60%)] opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]">
            Active job
          </p>
          <p className="mt-1 line-clamp-1 text-sm font-semibold text-white">
            {jobLabel}
          </p>
          <p className="mt-1 text-xs text-neutral-300">
            WO {woLabel}
            {vehicleLabel ? ` • ${vehicleLabel}` : ""}
          </p>
        </div>
        <span className="text-xs text-[color:var(--accent-copper,#f97316)]">
          Open →
        </span>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------------ */
/* Existing cards/buttons                                                   */
/* ------------------------------------------------------------------------ */

function OverviewCard({
  title,
  value,
  href,
}: {
  title: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="group relative overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-br from-black/80 via-slate-950/90 to-black/85 px-4 py-4 shadow-[0_20px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl transition hover:border-[color:var(--accent-copper,#f97316)]/80 hover:shadow-[0_0_35px_rgba(249,115,22,0.55)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),transparent_60%)] opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
          {title}
        </p>
        <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

function QuickButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-copper,#f97316)]/70 bg-gradient-to-r from-black/70 via-slate-950/90 to-black/80 px-4 py-2 text-sm text-white shadow-[0_12px_28px_rgba(0,0,0,0.9)] backdrop-blur-md transition hover:bg-[color:var(--accent-copper,#f97316)]/15 hover:border-[color:var(--accent-copper-light,#fed7aa)]"
    >
      {children}
    </Link>
  );
}