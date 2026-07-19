"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  ClipboardCheck,
  Gauge,
  MessageCircle,
  Wrench,
} from "lucide-react";

import type { MobileRole } from "@/features/mobile/config/mobile-tiles";
import { fetchMobileShiftState } from "@/features/mobile/shifts/client";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"] & {
  active_segment_started_at?: string | null;
};
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];

export type PeriodStats = {
  workedHours: number;
  billedHours: number;
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
  label: string;
  status: string;
  href: string;
};

type Props = {
  techName: string;
  role: MobileRole;
  stats: MobileTechStats | null;
  jobs: MobileTechJob[];
  loadingStats?: boolean;
};

type ShiftStatus = "none" | "active" | "break" | "lunch" | "ended";

const emptyPeriod: PeriodStats = {
  workedHours: 0,
  billedHours: 0,
  efficiencyPct: null,
};

function firstNameFrom(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "Tech";
}

function formatStatus(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function vehicleLabel(vehicle: Vehicle | null): string | null {
  if (!vehicle) return null;
  const base = [vehicle.year, vehicle.make, vehicle.model]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const plate = String(vehicle.license_plate ?? "").trim();
  if (base && plate) return `${base} • ${plate}`;
  return base || plate || null;
}

function efficiencyText(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value > 250) return "250%+";
  if (value < 0) return "0%";
  return `${value.toFixed(0)}%`;
}

export function MobileTechHome({
  techName,
  role: _role,
  stats,
  jobs,
  loadingStats = false,
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [shiftStatus, setShiftStatus] = useState<ShiftStatus>("none");
  const [shiftStart, setShiftStart] = useState<string | null>(null);
  const [loadingShift, setLoadingShift] = useState(false);
  const [currentJob, setCurrentJob] = useState<WorkOrderLine | null>(null);
  const [currentJobWorkOrder, setCurrentJobWorkOrder] =
    useState<WorkOrder | null>(null);
  const [currentJobVehicle, setCurrentJobVehicle] =
    useState<Vehicle | null>(null);
  const [loadingCurrentJob, setLoadingCurrentJob] = useState(false);

  const firstName = firstNameFrom(techName);
  const today = stats?.today ?? emptyPeriod;
  const week = stats?.week ?? emptyPeriod;
  const openJobs = stats?.openJobs ?? 0;
  const assignedJobs = stats?.assignedJobs ?? 0;
  const jobsCompletedToday = stats?.jobsCompletedToday ?? 0;
  const isOnShift = shiftStatus !== "none" && shiftStatus !== "ended";

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

      const state = await fetchMobileShiftState();
      setShiftStart(state.startTime ?? null);
      setShiftStatus(state.mode === "shift" ? "active" : state.mode);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[MobileTechHome] shift state refresh failed", error);
      setShiftStatus("none");
      setShiftStart(null);
    } finally {
      setLoadingShift(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refreshShiftState();
  }, [refreshShiftState]);

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
        () => void refreshShiftState(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshShiftState, supabase, userId]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => void refreshShiftState());
    return () => subscription.unsubscribe();
  }, [refreshShiftState, supabase]);

  const loadCurrentJob = useCallback(
    async (technicianId: string | null) => {
      if (!technicianId) {
        setCurrentJob(null);
        setCurrentJobWorkOrder(null);
        setCurrentJobVehicle(null);
        return;
      }

      setLoadingCurrentJob(true);
      try {
        const { data: segments, error: segmentError } = await supabase
          .from("work_order_line_labor_segments")
          .select("work_order_line_id, started_at")
          .eq("technician_id", technicianId)
          .is("ended_at", null)
          .order("started_at", { ascending: false })
          .limit(1);

        if (segmentError) {
          // eslint-disable-next-line no-console
          console.error("[MobileTechHome] active segment load failed", segmentError);
        }

        const activeLineId = segments?.[0]?.work_order_line_id ?? null;
        let line: WorkOrderLine | null = null;

        if (activeLineId) {
          const { data, error } = await supabase
            .from("work_order_lines")
            .select(
              "id, work_order_id, description, complaint, job_type, line_type, status, punched_in_at, punched_out_at, assigned_tech_id",
            )
            .eq("id", activeLineId)
            .maybeSingle<WorkOrderLine>();

          if (error) {
            // eslint-disable-next-line no-console
            console.error("[MobileTechHome] active line load failed", error);
          } else if (data && (data.line_type ?? "job") !== "info") {
            line = {
              ...data,
              active_segment_started_at: segments?.[0]?.started_at ?? null,
            };
          }
        }

        if (!line) {
          const { data, error } = await supabase
            .from("work_order_lines")
            .select(
              "id, work_order_id, description, complaint, job_type, line_type, status, punched_in_at, punched_out_at, assigned_tech_id",
            )
            .eq("assigned_tech_id", technicianId)
            .or("line_type.eq.job,line_type.is.null")
            .not("punched_in_at", "is", null)
            .is("punched_out_at", null)
            .order("punched_in_at", { ascending: false })
            .limit(1)
            .maybeSingle<WorkOrderLine>();

          if (error) {
            // eslint-disable-next-line no-console
            console.error("[MobileTechHome] current job fallback failed", error);
          } else {
            line = data ?? null;
          }
        }

        setCurrentJob(line);
        if (!line?.work_order_id) {
          setCurrentJobWorkOrder(null);
          setCurrentJobVehicle(null);
          return;
        }

        const { data: workOrder, error: workOrderError } = await supabase
          .from("work_orders")
          .select("id, custom_id, vehicle_id")
          .eq("id", line.work_order_id)
          .maybeSingle<WorkOrder>();

        if (workOrderError || !workOrder) {
          if (workOrderError) {
            // eslint-disable-next-line no-console
            console.error("[MobileTechHome] current work order load failed", workOrderError);
          }
          setCurrentJobWorkOrder(null);
          setCurrentJobVehicle(null);
          return;
        }

        setCurrentJobWorkOrder(workOrder);
        if (!workOrder.vehicle_id) {
          setCurrentJobVehicle(null);
          return;
        }

        const { data: vehicle, error: vehicleError } = await supabase
          .from("vehicles")
          .select("id, year, make, model, license_plate")
          .eq("id", workOrder.vehicle_id)
          .maybeSingle<Vehicle>();

        if (vehicleError) {
          // eslint-disable-next-line no-console
          console.error("[MobileTechHome] current vehicle load failed", vehicleError);
          setCurrentJobVehicle(null);
        } else {
          setCurrentJobVehicle(vehicle ?? null);
        }
      } finally {
        setLoadingCurrentJob(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    void loadCurrentJob(userId);
  }, [loadCurrentJob, shiftStatus, userId]);

  const shiftCopy = useMemo(() => {
    const start = shiftStart
      ? new Date(shiftStart).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

    if (loadingShift) return { label: "Checking shift…", detail: null };
    if (shiftStatus === "active") {
      return { label: "On shift", detail: start ? `Started ${start}` : null };
    }
    if (shiftStatus === "break") {
      return { label: "On break", detail: start ? `Shift started ${start}` : null };
    }
    if (shiftStatus === "lunch") {
      return { label: "At lunch", detail: start ? `Shift started ${start}` : null };
    }
    if (shiftStatus === "ended") {
      return { label: "Shift ended", detail: "Open the menu to start another shift." };
    }
    return { label: "Off shift", detail: "Open the menu when you are ready to clock in." };
  }, [loadingShift, shiftStart, shiftStatus]);

  return (
    <div className="mobile-tech-page mx-auto w-full max-w-3xl space-y-4 px-3 py-3 sm:px-4">
      <section className="mobile-tech-panel p-4 text-[color:var(--theme-text-primary)]">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          Technician
        </div>
        <h1 className="mt-2 text-2xl font-semibold leading-tight">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
          Your jobs, inspections, and shop tools.
        </p>
        <ShiftStatusChip
          status={shiftStatus}
          label={shiftCopy.label}
          detail={shiftCopy.detail}
          loading={loadingShift}
        />
      </section>

      <CurrentJobCard
        loading={loadingCurrentJob}
        onShift={isOnShift}
        job={currentJob}
        workOrder={currentJobWorkOrder}
        vehicle={currentJobVehicle}
      />

      <section className="space-y-2">
        <h2 className="px-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
          Work
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <QuickLinkCard
            href="/mobile/tech/queue"
            title="My jobs"
            detail={loadingStats ? "Loading…" : `${openJobs} open`}
            icon={BriefcaseBusiness}
          />
          <QuickLinkCard
            href="/mobile/inspections"
            title="Inspections"
            detail="Start or continue"
            icon={ClipboardCheck}
          />
        </div>
      </section>

      {jobs.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Today&apos;s jobs
            </h2>
            <Link
              href="/mobile/tech/queue"
              className="text-xs font-medium text-[var(--accent-copper)]"
            >
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {jobs.slice(0, 4).map((job) => (
              <Link
                key={job.id}
                href={job.href}
                className="mobile-tech-subpanel flex min-h-14 items-center justify-between gap-3 px-3 py-2.5 active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                    {job.label}
                  </div>
                  <div className="mt-0.5 text-[0.68rem] text-[color:var(--theme-text-secondary)]">
                    {formatStatus(job.status)}
                  </div>
                </div>
                <span className="shrink-0 text-xs font-medium text-[var(--accent-copper)]">
                  Open →
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="px-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
          Shop tools
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <QuickLinkCard
            href="/mobile/messages"
            title="Team chat"
            detail="Messages from the shop"
            icon={MessageCircle}
          />
          <QuickLinkCard
            href="/mobile/tech/performance"
            title="My performance"
            detail="Hours and efficiency"
            icon={Gauge}
          />
        </div>
      </section>

      <details className="mobile-tech-panel group overflow-hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-[color:var(--theme-text-primary)]">
          <span>Hours &amp; efficiency</span>
          <span className="text-xs text-[color:var(--theme-text-secondary)] group-open:rotate-180">
            ▼
          </span>
        </summary>
        <div className="space-y-3 border-t border-[color:var(--theme-border-soft)] px-4 py-4">
          <PerformanceRow label="Today" stats={today} loading={loadingStats} />
          <PerformanceRow label="This week" stats={week} loading={loadingStats} />
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Open" value={loadingStats ? "…" : openJobs} />
            <Metric label="Assigned" value={loadingStats ? "…" : assignedJobs} />
            <Metric
              label="Done today"
              value={loadingStats ? "…" : jobsCompletedToday}
            />
          </div>
        </div>
      </details>
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
  detail: string | null;
  loading: boolean;
}) {
  const tone = loading
    ? "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
    : status === "active"
      ? "border-emerald-400/45 bg-emerald-500/10"
      : status === "break" || status === "lunch"
        ? "border-amber-400/45 bg-amber-500/10"
        : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]";

  return (
    <div className={`mt-4 flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 ${tone}`}>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        {detail ? (
          <div className="mt-0.5 text-[0.7rem] text-[color:var(--theme-text-secondary)]">
            {detail}
          </div>
        ) : null}
      </div>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          status === "active"
            ? "bg-emerald-400"
            : status === "break" || status === "lunch"
              ? "bg-amber-400"
              : "bg-[color:var(--theme-text-muted)]"
        }`}
      />
    </div>
  );
}

function CurrentJobCard({
  loading,
  onShift,
  job,
  workOrder,
  vehicle,
}: {
  loading: boolean;
  onShift: boolean;
  job: WorkOrderLine | null;
  workOrder: WorkOrder | null;
  vehicle: Vehicle | null;
}) {
  if (!onShift) return null;

  if (loading) {
    return (
      <section className="mobile-tech-panel p-4">
        <div className="h-4 w-24 animate-pulse rounded bg-[color:var(--theme-surface-subtle)]" />
        <div className="mt-3 h-8 animate-pulse rounded-lg bg-[color:var(--theme-surface-subtle)]" />
      </section>
    );
  }

  if (!job || !workOrder) {
    return (
      <section className="mobile-tech-panel p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]">
            <Wrench className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">No active job</div>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              Open your assigned work when you are ready to start a line.
            </p>
          </div>
        </div>
        <Link
          href="/mobile/tech/queue"
          className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-[color:var(--accent-copper)] px-4 text-sm font-semibold text-white"
        >
          Open my jobs
        </Link>
      </section>
    );
  }

  const label =
    job.description || job.complaint || String(job.job_type ?? "Job in progress");
  const workOrderLabel = workOrder.custom_id || workOrder.id.slice(0, 8);
  const vehicleText = vehicleLabel(vehicle);

  return (
    <Link
      href={`/mobile/jobs/${job.id}`}
      className="mobile-tech-panel block border border-[var(--accent-copper-soft)]/70 p-4 active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper)]">
            Current job
          </div>
          <div className="mt-1 truncate text-base font-semibold text-[color:var(--theme-text-primary)]">
            {label}
          </div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            WO {workOrderLabel}
            {vehicleText ? ` • ${vehicleText}` : ""}
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold text-[var(--accent-copper)]">
          Open →
        </span>
      </div>
    </Link>
  );
}

function QuickLinkCard({
  href,
  title,
  detail,
  icon: Icon,
}: {
  href: string;
  title: string;
  detail: string;
  icon: typeof BriefcaseBusiness;
}) {
  return (
    <Link
      href={href}
      className="mobile-tech-subpanel min-w-0 p-3 active:scale-[0.99]"
    >
      <div className="grid h-9 w-9 place-items-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] text-[var(--accent-copper)]">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="mt-3 text-sm font-semibold text-[color:var(--theme-text-primary)]">
        {title}
      </div>
      <div className="mt-1 text-[0.7rem] leading-4 text-[color:var(--theme-text-secondary)]">
        {detail}
      </div>
    </Link>
  );
}

function PerformanceRow({
  label,
  stats,
  loading,
}: {
  label: string;
  stats: PeriodStats;
  loading: boolean;
}) {
  return (
    <div className="mobile-tech-subpanel p-3">
      <div className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
        {label}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <PerformanceValue
          label="Worked"
          value={loading ? "…" : `${stats.workedHours.toFixed(1)}h`}
        />
        <PerformanceValue
          label="Billed"
          value={loading ? "…" : `${stats.billedHours.toFixed(1)}h`}
        />
        <PerformanceValue
          label="Efficiency"
          value={loading ? "…" : efficiencyText(stats.efficiencyPct)}
        />
      </div>
    </div>
  );
}

function PerformanceValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[0.6rem] uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
        {value}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-2 text-center">
      <div className="text-base font-semibold text-[color:var(--theme-text-primary)]">
        {value}
      </div>
      <div className="mt-0.5 text-[0.58rem] uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
    </div>
  );
}
