// /features/mobile/dashboard/MobileTechHome.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { MobileRole } from "@/features/mobile/config/mobile-tiles";
import { fetchMobileShiftState } from "@/features/mobile/shifts/client";

type DB = Database;

export type PeriodStats = {
  workedHours: number;
  billedHours: number;
  /** 0–100, null if not computable */
  efficiencyPct: number | null;
};

export type MobileTechStats = {
  openJobs: number;
  assignedJobs: number;
  jobsCompletedToday: number;
  today: PeriodStats;
  week: PeriodStats;
};

export type MobileTechJob = {
  id: string;
  label: string; // e.g. "2018 F-150 – Brakes"
  status: string; // e.g. "in_progress"
  href: string; // e.g. "/mobile/work-orders/123"
};

type Props = {
  techName: string;
  role: MobileRole;
  stats: MobileTechStats | null;
  jobs: MobileTechJob[];
  loadingStats?: boolean;
};

type ShiftStatus = "none" | "active" | "break" | "lunch" | "ended";

type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"] & {
  active_segment_started_at?: string | null;
};
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];

export function MobileTechHome({
  techName,
  role: _role,
  stats,
  jobs,
  loadingStats = false,
}: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [userId, setUserId] = useState<string | null>(null);

  const [shiftStatus, setShiftStatus] = useState<ShiftStatus>("none");
  const [shiftStart, setShiftStart] = useState<string | null>(null);
  const [loadingShift, setLoadingShift] = useState(false);

  // current punched-in job
  const [currentJob, setCurrentJob] = useState<WorkOrderLine | null>(null);
  const [currentJobWorkOrder, setCurrentJobWorkOrder] =
    useState<WorkOrder | null>(null);
  const [currentJobVehicle, setCurrentJobVehicle] = useState<Vehicle | null>(
    null,
  );
  const [loadingCurrentJob, setLoadingCurrentJob] = useState(false);

  const firstName = techName?.split(" ")[0] ?? techName ?? "Tech";

  const today: PeriodStats = stats?.today ?? {
    workedHours: 0,
    billedHours: 0,
    efficiencyPct: null,
  };
  const week: PeriodStats = stats?.week ?? {
    workedHours: 0,
    billedHours: 0,
    efficiencyPct: null,
  };

  const openJobs = stats?.openJobs ?? 0;
  const assignedJobs = stats?.assignedJobs ?? 0;
  const jobsCompletedToday = stats?.jobsCompletedToday ?? 0;

  const isOnShift = shiftStatus !== "none" && shiftStatus !== "ended";

  /* ---------------------------------------------------------------------- */
  /* Load / refresh shift state (aligned with MobileShiftTracker)           */
  /* ---------------------------------------------------------------------- */

  const refreshShiftState = useCallback(async () => {
    setLoadingShift(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const id = session?.user?.id ?? null;
      setUserId(id);

      if (!id) {
        setShiftStatus("none");
        setShiftStart(null);
        return;
      }
      const canonical = await fetchMobileShiftState();
      setShiftStart(canonical.startTime ?? null);
      if (canonical.mode === "shift") setShiftStatus("active");
      else setShiftStatus(canonical.mode);
    } catch (error) {
      console.error("[MobileTechHome] shift state refresh failed:", error);
      setShiftStatus("none");
      setShiftStart(null);
    } finally {
      setLoadingShift(false);
    }
  }, [supabase]);

  // initial load
  useEffect(() => {
    void refreshShiftState();
  }, [refreshShiftState]);

  // realtime: follow canonical shift persistence tables for this user
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`mobile-tech-home-shifts:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tech_shifts",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refreshShiftState();
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [supabase, userId, refreshShiftState]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refreshShiftState();
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, refreshShiftState]);

  /* ---------------------------------------------------------------------- */
  /* Current job – job the tech is punched in on                            */
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
        const { data: activeSegments, error: segmentError } = await supabase
          .from("work_order_line_labor_segments")
          .select("work_order_line_id, started_at")
          .eq("technician_id", uid)
          .is("ended_at", null)
          .order("started_at", { ascending: false })
          .limit(1);

        const activeLineId = activeSegments?.[0]?.work_order_line_id ?? null;

        let line: WorkOrderLine | null = null;

        if (activeLineId) {
          const { data: activeLine, error } = await supabase
            .from("work_order_lines")
            .select(
              "id, work_order_id, description, complaint, job_type, line_type, punched_in_at, punched_out_at, assigned_tech_id",
            )
            .eq("id", activeLineId)
            .maybeSingle();

          if (error) {
            console.error("[MobileTechHome] current job active-line load error:", error);
          } else if (activeLine && (activeLine.line_type ?? "job") !== "info") {
            line = {
              ...(activeLine as WorkOrderLine),
              active_segment_started_at: activeSegments?.[0]?.started_at ?? null,
            };
          }
        }

        if (!line) {
          const { data, error } = await supabase
            .from("work_order_lines")
            .select(
              "id, work_order_id, description, complaint, job_type, line_type, punched_in_at, punched_out_at, assigned_tech_id",
            )
            .eq("assigned_tech_id", uid)
            .or("line_type.eq.job,line_type.is.null")
            .not("punched_in_at", "is", null)
            .is("punched_out_at", null)
            .order("punched_in_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) {
            console.error("[MobileTechHome] current job fallback load error:", error);
            setCurrentJob(null);
            setCurrentJobWorkOrder(null);
            setCurrentJobVehicle(null);
            return;
          }

          line = (data as WorkOrderLine | null) ?? null;
        }

        if (segmentError) {
          console.error("[MobileTechHome] active segment load error:", segmentError);
        }
        setCurrentJob(line);

        if (!line?.work_order_id) {
          setCurrentJobWorkOrder(null);
          setCurrentJobVehicle(null);
          return;
        }

        // Fetch the related work order
        const { data: wo, error: woErr } = await supabase
          .from("work_orders")
          .select("id, custom_id, vehicle_id")
          .eq("id", line.work_order_id)
          .maybeSingle<WorkOrder>();

        if (woErr) {
          console.error("[MobileTechHome] current job WO load error:", woErr);
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
            console.error(
              "[MobileTechHome] current job vehicle load error:",
              vehErr,
            );
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

  // load current job whenever user or shift status changes
  useEffect(() => {
    void loadCurrentJob(userId);
  }, [userId, shiftStatus, loadCurrentJob]);

  /* ---------------------------------------------------------------------- */
  /* Derived labels for hero chip                                           */
  /* ---------------------------------------------------------------------- */

  let statusLabel: string = "Off shift";
  let statusDetail: string | null = "Use the menu to start your day.";

  let timeStr: string | null = null;
  if (shiftStart) {
    const dt = new Date(shiftStart);
    timeStr = dt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loadingShift) {
    statusLabel = "Checking shift…";
    statusDetail = null;
  } else {
    switch (shiftStatus) {
      case "none":
        statusLabel = "Off shift";
        statusDetail = "Use the menu to start your day.";
        break;
      case "active":
        statusLabel = "On shift";
        statusDetail = timeStr ? `since ${timeStr}` : null;
        break;
      case "break":
        statusLabel = "On break";
        statusDetail = timeStr ? `since ${timeStr}` : null;
        break;
      case "lunch":
        statusLabel = "At lunch";
        statusDetail = timeStr ? `since ${timeStr}` : null;
        break;
      case "ended":
        statusLabel = "Shift ended";
        statusDetail = "You can start a new shift from the menu.";
        break;
      default:
        statusLabel = "Off shift";
        statusDetail = "Use the menu to start your day.";
    }
  }

  // Hints for “0” data that’s confusing to techs
  const todayHint = !loadingStats
    ? isOnShift && today.workedHours <= 0
      ? "Clock in to track worked hours."
      : jobsCompletedToday > 0 && today.billedHours <= 0
        ? "No billed labor recorded yet today."
        : today.workedHours > 0 && today.billedHours <= 0
          ? "No billed labor recorded yet today."
          : null
    : null;

  const weekHint = !loadingStats
    ? week.workedHours > 0 && week.billedHours <= 0
      ? "No billed labor recorded yet this week."
      : null
    : null;

  return (
    <div className="mobile-tech-page space-y-5 px-4 py-4">
      {/* hero – brushed metal panel */}
      <section className="mobile-tech-panel px-4 py-4 text-white">
        <div className="space-y-4">
          <div className="text-center">
            <h1 className="text-xl font-semibold leading-tight">
              <span className="text-neutral-100">Welcome back, </span>
              <span className="text-[var(--accent-copper)]">{firstName}</span>{" "}
              <span className="align-middle">👋</span>
            </h1>
            <p className="mt-1 text-xs text-neutral-300">
              Bench-side view of today’s work and efficiency.
            </p>
          </div>

          <ShiftStatusChip
            status={shiftStatus}
            label={statusLabel}
            detail={statusDetail}
            loading={loadingShift}
          />
        </div>
      </section>

      {/* current job pill – only while on shift */}
      {isOnShift && (
        <CurrentJobPill
          loading={loadingCurrentJob}
          job={currentJob}
          workOrder={currentJobWorkOrder}
          vehicle={currentJobVehicle}
        />
      )}

      {/* summary cards – worked vs billed */}
      <section className="space-y-3">
        <SummaryCard
          label="Today"
          stats={today}
          loading={loadingStats}
          hint={todayHint}
        />
        <SummaryCard
          label="This week"
          stats={week}
          loading={loadingStats}
          hint={weekHint}
        />
      </section>

      {/* stat chips – jobs overview */}
      <section className="grid grid-cols-3 gap-2.5">
        <StatCard
          label="Open jobs"
          value={loadingStats ? "…" : openJobs}
          variant="accent"
        />
        <StatCard label="Assigned" value={loadingStats ? "…" : assignedJobs} />
        <StatCard
          label="Jobs done"
          value={loadingStats ? "…" : jobsCompletedToday}
        />
      </section>

      {/* stat chips – keep ONLY billed today (eff is already in the summary cards) */}

      {/* today jobs */}
      {jobs.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Today&apos;s jobs
            </h2>
            <Link
              href="/mobile/work-orders"
              className="text-[0.7rem] text-sky-300 underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={job.href}
                  className="mobile-tech-subpanel block px-3 py-2 text-xs text-neutral-100"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-medium">{job.label}</div>
                    <span className="accent-chip rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-sky-300">
                      {job.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* tools */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Tools
        </h2>
        <p className="text-[0.7rem] text-neutral-500">
          Quick actions for your bench.
        </p>
        <div className="space-y-2">
          <ToolCard
            href="/mobile/tech/performance"
            label="My performance"
            description="Revenue, hours & efficiency"
          />
          <ToolCard
            href="/mobile/tech/queue"
            label="My jobs"
            description="Assigned work orders"
          />
          <ToolCard
            href="/mobile/messages"
            label="Team chat"
            description="Stay in sync"
          />
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Pieces                                                                   */
/* ------------------------------------------------------------------------ */

function CurrentJobPill({
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
      <div className="mobile-tech-subpanel inline-flex w-full items-center justify-between px-3 py-2 text-[0.75rem] text-neutral-300">
        <span className="uppercase tracking-[0.16em] text-neutral-400">
          Current job
        </span>
        <span>Loading…</span>
      </div>
    );
  }

  if (!job || !workOrder) {
    return (
      <div className="mobile-tech-subpanel inline-flex w-full items-center justify-between px-3 py-2 text-[0.75rem] text-neutral-400">
        <span className="uppercase tracking-[0.16em] text-neutral-400">
          Current job
        </span>
        <span className="text-[0.7rem] text-neutral-500">
          No active job punch
        </span>
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

  // 🔗 Include the line id so the mobile WO page can auto-focus that job
  const href = `/mobile/work-orders/${workOrder.id}?focus=${job.id}`;

  return (
    <Link
      href={href}
      className="mobile-tech-subpanel flex items-center justify-between border border-sky-500/35 px-3 py-2 text-[0.8rem] text-neutral-100"
    >
      <div className="flex flex-col">
        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-sky-300">
          Current job
        </span>
        <span className="mt-0.5 truncate text-sm font-medium">{jobLabel}</span>
        <span className="mt-0.5 text-[0.7rem] text-neutral-300">
          WO {woLabel}
          {vehicleLabel ? ` • ${vehicleLabel}` : ""}
        </span>
      </div>
      <span className="ml-3 text-xs text-sky-300">
        Go →
      </span>
    </Link>
  );
}

function StatCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number | string;
  variant?: "default" | "accent";
}) {
  const base = "mobile-tech-stat px-3 py-3";

  const variantClasses =
    variant === "accent"
      ? "border-sky-500/35"
      : "border-[var(--metal-border-soft)]";

  return (
    <div className={`${base} ${variantClasses}`}>
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-neutral-400 text-center">
        {label}
      </div>
      <div className="mt-1 flex items-baseline justify-center gap-1 text-lg font-semibold text-white">
        <span>{value}</span>
      </div>
    </div>
  );
}

function clampEfficiencyText(efficiencyPct: number): string {
  if (!Number.isFinite(efficiencyPct)) return "–";
  if (efficiencyPct > 250) return "250%+";
  if (efficiencyPct < 0) return "0%";
  return `${efficiencyPct.toFixed(0)}%`;
}

function SummaryCard({
  label,
  stats,
  loading,
  hint,
}: {
  label: string;
  stats: PeriodStats;
  loading?: boolean;
  hint?: string | null;
}) {
  const worked = stats.workedHours;
  const billed = stats.billedHours;
  const eff = stats.efficiencyPct;

  const workedText = loading ? "…" : `${worked.toFixed(1)} h`;
  const billedText = loading ? "…" : `${billed.toFixed(1)} h`;

  const effText =
    loading || eff === null ? "–" : clampEfficiencyText(Number(eff));

  return (
    <div className="mobile-tech-panel px-4 py-3">
      <div className="text-center text-[0.65rem] uppercase tracking-[0.18em] text-neutral-300">
        {label} – Worked vs Billed
      </div>

      <div className="mt-2 flex items-baseline justify-center gap-4 text-sm text-neutral-100">
        <div className="text-center">
          <span className="text-neutral-400">Worked</span>{" "}
          <span className="font-semibold text-white">{workedText}</span>
        </div>
        <div className="text-center">
          <span className="text-neutral-400">Billed</span>{" "}
          <span className="font-semibold text-white">{billedText}</span>
        </div>
      </div>

      <div className="mt-2 text-center text-[0.7rem] text-neutral-400">
        Efficiency:{" "}
        <span className="font-semibold text-sky-300">
          {effText}
        </span>
      </div>

      {hint ? (
        <div className="mt-2 text-center text-[0.7rem] text-neutral-500">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ShiftStatusChip({
  status,
  label,
  detail,
  loading,
}: {
  status: ShiftStatus;
  label: string;
  detail?: string | null;
  loading?: boolean;
}) {
  // full-width rectangular banner
  const base =
    "w-full border px-4 py-3 text-[0.75rem] font-medium rounded-md flex flex-col items-center justify-center text-center";

  let classes = "";

  if (loading) {
    classes = "border-[var(--metal-border-soft)] text-neutral-100 bg-slate-900/70";
  } else if (status === "active") {
    classes = "border-sky-400/70 text-sky-100 bg-sky-500/12";
  } else if (status === "break") {
    classes = "border-amber-400/70 text-amber-100 bg-amber-500/12";
  } else if (status === "lunch") {
    classes = "border-amber-500/70 text-amber-100 bg-amber-500/14";
  } else if (status === "ended") {
    classes = "border-red-500/70 text-red-100 bg-red-500/12";
  } else {
    classes = "border-[var(--metal-border-soft)] text-neutral-200 bg-slate-900/70";
  }

  return (
    <div className={`${base} ${classes}`}>
      <span className="uppercase tracking-[0.2em]">{label}</span>
      {detail ? (
        <span className="mt-1 text-[0.7rem] text-neutral-100/90">{detail}</span>
      ) : null}
    </div>
  );
}

function ToolCard({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="mobile-tech-subpanel block px-4 py-3 text-sm text-neutral-100 transition hover:border-sky-500/45"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
            {label}
          </div>
          <div className="mt-1 text-sm">{description}</div>
        </div>
        <span className="text-xs text-sky-300">›</span>
      </div>
    </Link>
  );
}
