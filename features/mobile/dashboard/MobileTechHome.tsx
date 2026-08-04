"use client";

import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Gauge,
  MessageCircle,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
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
  if (base && plate) return `${base} · ${plate}`;
  return base || plate || null;
}

function efficiencyText(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value > 250) return "250%+";
  if (value < 0) return "0%";
  return `${value.toFixed(0)}%`;
}

function focusedJobHref(job: MobileTechJob): string {
  const separator = job.href.includes("?") ? "&" : "?";
  return `${job.href}${separator}focus=${encodeURIComponent(job.id)}`;
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
    const onShiftUpdated = () => void refreshShiftState();
    window.addEventListener("profixiq:mobile-shift-updated", onShiftUpdated);
    return () =>
      window.removeEventListener(
        "profixiq:mobile-shift-updated",
        onShiftUpdated,
      );
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
            console.error(
              "[MobileTechHome] current work order load failed",
              workOrderError,
            );
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
          hour: "numeric",
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
      return {
        label: "Shift ended",
        detail: "Open shift controls when you return.",
      };
    }
    return {
      label: "Off shift",
      detail: "Clock in before starting assigned work.",
    };
  }, [loadingShift, shiftStart, shiftStatus]);

  return (
    <div className="mobile-tech-page">
      <section className="mobile-tech-panel p-4 text-[color:var(--theme-text-primary)]">
        <div className="text-[0.64rem] font-extrabold uppercase tracking-[0.18em] text-[#8ed4ff]">
          {todayLabel()}
        </div>
        <h1 className="mt-2 text-2xl font-extrabold leading-tight text-white">
          {greeting()}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          Current work, assigned jobs and today&apos;s performance.
        </p>

        <ShiftCommand
          status={shiftStatus}
          label={shiftCopy.label}
          detail={shiftCopy.detail}
          loading={loadingShift}
        />

        <div className="mt-3 grid grid-cols-3 gap-2">
          <HeroMetric
            label="Open"
            value={loadingStats ? "…" : openJobs}
          />
          <HeroMetric
            label="Assigned"
            value={loadingStats ? "…" : assignedJobs}
          />
          <HeroMetric
            label="Done today"
            value={loadingStats ? "…" : jobsCompletedToday}
          />
        </div>
      </section>

      <CurrentJobCard
        loading={loadingCurrentJob}
        onShift={isOnShift}
        job={currentJob}
        workOrder={currentJobWorkOrder}
        vehicle={currentJobVehicle}
      />

      {jobs.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
                Up next
              </h2>
              <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                Assigned work ready to continue.
              </p>
            </div>
            <Link
              href="/mobile/tech/queue"
              className="text-xs font-bold text-[color:var(--accent-copper)]"
            >
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {jobs.slice(0, 4).map((job, index) => (
              <Link
                key={job.id}
                href={focusedJobHref(job)}
                className="mobile-tech-subpanel flex min-h-[4.5rem] items-center gap-3 border px-3 py-2.5 active:scale-[0.992]"
              >
                <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color:var(--theme-surface-subtle)] text-sm font-extrabold text-[color:var(--accent-copper)]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[color:var(--theme-text-primary)]">
                    {job.label}
                  </span>
                  <span className="mt-0.5 block text-[0.68rem] text-[color:var(--theme-text-secondary)]">
                    {formatStatus(job.status)}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="h-5 w-5 shrink-0 text-[color:var(--accent-copper)]"
                />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="px-1 text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <ActionTile
            href="/mobile/tech/queue"
            title="My jobs"
            detail={loadingStats ? "Loading…" : `${openJobs} open`}
            icon={BriefcaseBusiness}
          />
          <ActionTile
            href="/mobile/inspections"
            title="Inspections"
            detail="Start or continue"
            icon={ClipboardCheck}
          />
        </div>
      </section>

      <section className="mobile-command-panel overflow-hidden border">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-[0.66rem] font-extrabold uppercase tracking-[0.17em] text-[color:var(--theme-text-muted)]">
              Today
            </div>
            <h2 className="mt-1 text-base font-bold text-[color:var(--theme-text-primary)]">
              Hours &amp; efficiency
            </h2>
          </div>
          <Gauge
            aria-hidden
            className="h-5 w-5 text-[color:var(--accent-copper)]"
          />
        </div>
        <div className="grid grid-cols-3 border-y border-[color:var(--theme-border-soft)]">
          <PerformanceValue
            label="Worked"
            value={loadingStats ? "…" : `${today.workedHours.toFixed(1)}h`}
          />
          <PerformanceValue
            label="Billed"
            value={loadingStats ? "…" : `${today.billedHours.toFixed(1)}h`}
            bordered
          />
          <PerformanceValue
            label="Efficiency"
            value={loadingStats ? "…" : efficiencyText(today.efficiencyPct)}
          />
        </div>
        <details className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-[color:var(--theme-text-primary)]">
            This week
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
          </summary>
          <div className="grid grid-cols-3 border-t border-[color:var(--theme-border-soft)]">
            <PerformanceValue
              label="Worked"
              value={loadingStats ? "…" : `${week.workedHours.toFixed(1)}h`}
            />
            <PerformanceValue
              label="Billed"
              value={loadingStats ? "…" : `${week.billedHours.toFixed(1)}h`}
              bordered
            />
            <PerformanceValue
              label="Efficiency"
              value={loadingStats ? "…" : efficiencyText(week.efficiencyPct)}
            />
          </div>
        </details>
        <Link
          href="/mobile/tech/performance"
          className="flex min-h-12 items-center justify-between border-t border-[color:var(--theme-border-soft)] px-4 text-sm font-bold text-[color:var(--accent-copper)]"
        >
          Open performance
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </section>

      <Link
        href="/mobile/messages"
        className="mobile-command-row flex min-h-[4.5rem] items-center gap-3 border px-4"
      >
        <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--theme-surface-subtle)] text-[color:var(--accent-copper)]">
          <MessageCircle aria-hidden className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-[color:var(--theme-text-primary)]">
            Team chat
          </span>
          <span className="mt-0.5 block text-xs text-[color:var(--theme-text-secondary)]">
            Messages and updates from the shop.
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="h-5 w-5 shrink-0 text-[color:var(--accent-copper)]"
        />
      </Link>
    </div>
  );
}

function ShiftCommand({
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
  const active = status === "active";
  const paused = status === "break" || status === "lunch";

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("profixiq:mobile-menu-open"))}
      className="mt-4 flex min-h-[4.35rem] w-full items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.075] px-3 text-left active:scale-[0.992]"
    >
      <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.09] text-[#8ed4ff]">
        <Clock3 aria-hidden className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-white">{label}</span>
        {detail ? (
          <span className="mt-0.5 block truncate text-[0.7rem] text-slate-300">
            {detail}
          </span>
        ) : null}
      </span>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          loading
            ? "animate-pulse bg-slate-400"
            : active
              ? "bg-emerald-400"
              : paused
                ? "bg-amber-400"
                : "bg-slate-500"
        }`}
      />
    </button>
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
        <div className="h-4 w-28 animate-pulse rounded bg-[color:var(--theme-surface-subtle)]" />
        <div className="mt-3 h-20 animate-pulse rounded-xl bg-[color:var(--theme-surface-subtle)]" />
      </section>
    );
  }

  if (!job || !workOrder) {
    return (
      <section className="mobile-tech-panel border p-4">
        <div className="flex items-start gap-3">
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[color:var(--theme-surface-subtle)] text-[color:var(--accent-copper)]">
            <Wrench aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[0.65rem] font-extrabold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
              On shift
            </div>
            <div className="mt-1 text-base font-bold text-[color:var(--theme-text-primary)]">
              No job currently running
            </div>
            <p className="mt-1 text-xs leading-4 text-[color:var(--theme-text-secondary)]">
              Open your assigned queue and start the next ready job.
            </p>
          </div>
        </div>
        <Link
          href="/mobile/tech/queue"
          className="mobile-command-primary mt-4 flex w-full items-center justify-center gap-2 px-4 text-sm font-bold"
        >
          Start next job
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </section>
    );
  }

  const label =
    job.description || job.complaint || String(job.job_type ?? "Job in progress");
  const workOrderLabel = workOrder.custom_id || workOrder.id.slice(0, 8);
  const vehicleText = vehicleLabel(vehicle);
  const href = `/mobile/work-orders/${workOrder.id}?focus=${encodeURIComponent(job.id)}`;

  return (
    <section className="mobile-tech-panel overflow-hidden border border-blue-400/35 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-[0.65rem] font-extrabold uppercase tracking-[0.17em] text-cyan-600 dark:text-cyan-300">
          <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_0_5px_rgba(34,211,238,0.12)]" />
          Current job
        </div>
        <span className="text-xs font-bold text-[color:var(--theme-text-secondary)]">
          {workOrderLabel}
        </span>
      </div>
      <h2 className="mt-4 text-xl font-extrabold tracking-[-0.035em] text-[color:var(--theme-text-primary)]">
        {label}
      </h2>
      <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
        {vehicleText || "Vehicle details unavailable"}
      </p>
      <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 aria-hidden className="h-4 w-4" />
        Active work is ready to continue
      </div>
      <Link
        href={href}
        className="mobile-command-primary mt-4 flex w-full items-center justify-center gap-2 px-4 text-sm font-bold"
      >
        Open current job
        <ArrowRight aria-hidden className="h-4 w-4" />
      </Link>
    </section>
  );
}

function ActionTile({
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
      className="mobile-tech-subpanel min-w-0 border p-3.5 active:scale-[0.992]"
    >
      <span className="inline-grid h-10 w-10 place-items-center rounded-xl bg-[color:var(--theme-surface-subtle)] text-[color:var(--accent-copper)]">
        <Icon aria-hidden className="h-5 w-5" />
      </span>
      <span className="mt-3 block text-sm font-bold text-[color:var(--theme-text-primary)]">
        {title}
      </span>
      <span className="mt-1 block text-[0.7rem] leading-4 text-[color:var(--theme-text-secondary)]">
        {detail}
      </span>
    </Link>
  );
}

function HeroMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 px-2 py-2.5 text-center">
      <div className="text-lg font-extrabold text-white">{value}</div>
      <div className="mt-0.5 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>
    </div>
  );
}

function PerformanceValue({
  label,
  value,
  bordered = false,
}: {
  label: string;
  value: string;
  bordered?: boolean;
}) {
  return (
    <div
      className={`px-2 py-3.5 text-center ${
        bordered ? "border-x border-[color:var(--theme-border-soft)]" : ""
      }`}
    >
      <div className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-base font-extrabold text-[color:var(--theme-text-primary)]">
        {value}
      </div>
    </div>
  );
}
