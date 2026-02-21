// app/dashboard/page.tsx (FULL FILE REPLACEMENT)
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Link from "next/link";

import ShopBoostWidget from "@/features/shared/components/ui/ShopBoostWidget";

// ✅ Pull tech performance using your existing stats helper
import type { TimeRange } from "@shared/lib/stats/getShopStats";
import {
  getTechLeaderboard,
  type TechLeaderboardRow,
} from "@shared/lib/stats/getTechLeaderboard";

type DB = Database;
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];

type CountState = {
  appointments: number | null;
  workOrders: number | null;
  partsRequests: number | null;
};

const CLOSED_PART_STATUSES = ["fulfilled", "rejected", "cancelled"] as const;

function isTechRole(role: string | null): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "tech" || r === "mechanic" || r === "technician";
}

function canViewShopHealth(role: string | null): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "owner" || r === "admin" || r === "advisor" || r === "manager";
}

function fmtHours(n: number): string {
  if (!Number.isFinite(n)) return "0.0h";
  return `${n.toFixed(1)}h`;
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(0)}%`;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  const [counts, setCounts] = useState<CountState>({
    appointments: null,
    workOrders: null,
    partsRequests: null,
  });

  // ✅ Tech performance snapshot for dashboard tiles
  const [perfRange] = useState<TimeRange>("weekly");
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfRow, setPerfRow] = useState<TechLeaderboardRow | null>(null);

  // current punched-in job for this user
  const [currentJob, setCurrentJob] = useState<WorkOrderLine | null>(null);
  const [currentJobWorkOrder, setCurrentJobWorkOrder] =
    useState<WorkOrder | null>(null);
  const [currentJobVehicle, setCurrentJobVehicle] = useState<Vehicle | null>(
    null,
  );
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

  /* ---------------------------------------------------------------------- */
  /* Counts (role-aware + shop-aware)                                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!userId) return;
    if (!shopId) return;

    (async () => {
      const tech = isTechRole(role);

      // Default "…" while loading
      setCounts({
        appointments: null,
        workOrders: null,
        partsRequests: null,
      });

      if (tech) {
        // TECH DASHBOARD COUNTS
        // - workOrders: count of non-completed assigned lines
        // - partsRequests: count of open part requests involving me (requested_by OR assigned_to)
        const [myJobs, myParts] = await Promise.all([
          supabase
            .from("work_order_lines")
            .select("id", { count: "exact", head: true })
            .eq("assigned_to", userId)
            .not("status", "in", "(completed,ready_to_invoice,invoiced)"),
          supabase
            .from("part_requests")
            .select("id", { count: "exact", head: true })
            .eq("shop_id", shopId)
            .not("status", "in", `(${CLOSED_PART_STATUSES.join(",")})`)
            .or(`requested_by.eq.${userId},assigned_to.eq.${userId}`),
        ]);

        setCounts({
          appointments: 0, // tech doesn't need appointment count; keep simple
          workOrders: myJobs.error ? 0 : myJobs.count ?? 0,
          partsRequests: myParts.error ? 0 : myParts.count ?? 0,
        });

        return;
      }

      // SHOP DASHBOARD COUNTS (owner/admin/advisor/manager)
      const [appt, wo, parts] = await Promise.all([
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", shopId),
        supabase
          .from("work_orders")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", shopId),
        supabase
          .from("part_requests")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", shopId)
          .not("status", "in", `(${CLOSED_PART_STATUSES.join(",")})`),
      ]);

      setCounts({
        appointments: appt.error ? 0 : appt.count ?? 0,
        workOrders: wo.error ? 0 : wo.count ?? 0,
        partsRequests: parts.error ? 0 : parts.count ?? 0,
      });
    })();
  }, [supabase, userId, shopId, role]);

  /* ---------------------------------------------------------------------- */
  /* Tech performance snapshot (for the circled tiles)                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!userId) return;
    if (!shopId) return;
    if (!isTechRole(role)) {
      setPerfRow(null);
      return;
    }

    (async () => {
      setPerfLoading(true);
      try {
        const result = await getTechLeaderboard(shopId, perfRange);
        const rows = result.rows ?? [];
        const my = rows.find((r) => r.techId === userId) ?? null;

        setPerfRow(
          my ?? {
            techId: userId,
            name: name ?? "Tech",
            role: role ?? null,
            jobs: 0,
            revenue: 0,
            laborCost: 0,
            profit: 0,
            billedHours: 0,
            clockedHours: 0,
            revenuePerHour: 0,
            efficiencyPct: 0,
          },
        );
      } catch (e) {
        console.error("[Dashboard] performance snapshot load failed", e);
        setPerfRow(null);
      } finally {
        setPerfLoading(false);
      }
    })();
  }, [userId, shopId, role, perfRange, name]);

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
            "id, work_order_id, description, complaint, job_type, punched_in_at, punched_out_at, assigned_to, status",
          )
          .eq("assigned_to", uid)
          .not("punched_in_at", "is", null)
          .is("punched_out_at", null)
          .order("punched_in_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
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

  const tech = isTechRole(role);
  const showShopHealth = canViewShopHealth(role);

  const workedText =
    perfLoading || !perfRow ? "…" : fmtHours(perfRow.clockedHours);
  const billedText =
    perfLoading || !perfRow ? "…" : fmtHours(perfRow.billedHours);
  const effText =
    perfLoading || !perfRow ? "…" : fmtPct(perfRow.efficiencyPct);

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
            Here’s a quick view of what matters today.
          </p>
        </div>
      </section>

      {/* Shop Boost / Health Snapshot (owner/admin/advisor/manager) */}
      <ShopBoostWidget shopId={shopId} canViewShopHealth={showShopHealth} />

      {/* active job pill – only for tech/mechanic roles */}
      {tech && (
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
        {tech ? (
          <>
            <OverviewCard
              title="My assigned jobs"
              value={counts.workOrders === null ? "…" : String(counts.workOrders)}
              href="/tech/queue"
            />

            {/* ✅ Performance tiles */}
            <OverviewCard
              title="Hours worked"
              value={workedText}
              href="/tech/performance"
            />
            <OverviewCard
              title="Billed hours"
              value={billedText}
              href="/tech/performance"
            />
            <OverviewCard
              title="Efficiency"
              value={effText}
              href="/tech/performance"
            />
          </>
        ) : (
          <>
            <OverviewCard
              title="Today’s appointments"
              value={
                counts.appointments === null ? "…" : String(counts.appointments)
              }
              href="/dashboard/appointments"
            />
            <OverviewCard
              title="Open work orders"
              value={counts.workOrders === null ? "…" : String(counts.workOrders)}
              href="/work-orders/view"
            />
            <OverviewCard
              title="Parts requests"
              value={
                counts.partsRequests === null ? "…" : String(counts.partsRequests)
              }
              href="/parts/requests"
            />
            <OverviewCard title="Team chat" value="Open" href="/chat" />
          </>
        )}
      </section>

      {/* quick actions */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          {tech ? (
            <>
              <QuickButton href="/tech/queue">My job queue</QuickButton>
              <QuickButton href="/parts/requests?mine=1">
                My parts requests
              </QuickButton>
              <QuickButton href="/ai/assistant">AI assistant</QuickButton>
            </>
          ) : (
            <>
              <QuickButton href="/work-orders/create?autostart=1">
                New work order
              </QuickButton>
              <QuickButton href="/dashboard/appointments">Appointments</QuickButton>
              <QuickButton href="/ai/assistant">AI assistant</QuickButton>
              {role === "owner" || role === "admin" ? (
                <QuickButton href="/dashboard/owner/reports">Reports</QuickButton>
              ) : null}
            </>
          )}
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
    job.description ||
    job.complaint ||
    String(job.job_type ?? "Job in progress");

  const vehicleLabel = vehicle
    ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`
        .trim()
        .replace(/\s+/g, " ")
    : null;

  const woLabel = workOrder.custom_id || workOrder.id.slice(0, 8);

  // always use the UUID id route
  const href = `/work-orders/${workOrder.id}?focus=${job.id}&mode=tech`;

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