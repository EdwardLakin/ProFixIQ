// features/mobile/dashboard/MobileTechHome.tsx
"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { MobileRole } from "@/features/mobile/config/mobile-tiles";

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

type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];

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
  const [loadingCurrentJob, setLoadingCurrentJob] = useState(false);

  const firstName = techName?.split(" ")[0] ?? techName ?? "Tech";

  const today = stats?.today ?? {
    workedHours: 0,
    billedHours: 0,
    efficiencyPct: null,
  };
  const week = stats?.week ?? {
    workedHours: 0,
    billedHours: 0,
    efficiencyPct: null,
  };

  const openJobs = stats?.openJobs ?? 0;
  const assignedJobs = stats?.assignedJobs ?? 0;
  const jobsCompletedToday = stats?.jobsCompletedToday ?? 0;

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

      // Latest shift for this user
      const { data: latestShift, error: sErr } = await supabase
        .from("tech_shifts")
        .select("id, start_time, end_time, status")
        .eq("user_id", id)
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sErr || !latestShift) {
        setShiftStatus("none");
        setShiftStart(null);
        return;
      }

      setShiftStart(latestShift.start_time ?? null);

      // If shift is closed, mark ended
      if (latestShift.end_time != null) {
        setShiftStatus("ended");
        return;
      }

      // Open shift – use last punch_event to decide active/break/lunch
      const { data: lastPunch } = await supabase
        .from("punch_events")
        .select("event_type")
        .eq("shift_id", latestShift.id)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();

      const t = lastPunch?.event_type;
      let computed: ShiftStatus = "active";

      if (t === "break_start") computed = "break";
      else if (t === "lunch_start") computed = "lunch";
      else if (t === "end_shift") computed = "ended";

      setShiftStatus(computed);
    } finally {
      setLoadingShift(false);
    }
  }, [supabase]);

  // initial load
  useEffect(() => {
    void refreshShiftState();
  }, [refreshShiftState]);

  // realtime: follow tech_shifts for this user so it matches bottom nav punches
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

  /* ---------------------------------------------------------------------- */
  /* Current job – job the tech is punched in on                            */
  /* ---------------------------------------------------------------------- */

  const loadCurrentJob = useCallback(
    async (uid: string | null) => {
      if (!uid) {
        setCurrentJob(null);
        return;
      }

      setLoadingCurrentJob(true);
      try {
        const { data, error } = await supabase
          .from("work_order_lines")
          .select(
            "id, work_order_id, description, complaint, job_type, punched_in_at, punched_out_at, punched_in_by",
          )
          .eq("punched_in_by", uid)
          .is("punched_out_at", null)
          .order("punched_in_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          // eslint-disable-next-line no-console
          console.error("[MobileTechHome] current job load error:", error);
          setCurrentJob(null);
          return;
        }

        setCurrentJob((data as WorkOrderLine | null) ?? null);
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

  return (
    <div className="space-y-6 px-4 py-4">
      {/* hero – brushed metal panel */}
      <section className="metal-panel metal-panel--hero rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 text-white shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
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

      {/* current job pill */}
      {shiftStatus !== "none" && shiftStatus !== "ended" && (
        <CurrentJobPill loading={loadingCurrentJob} job={currentJob} />
      )}

      {/* summary cards – worked vs billed */}
      <section className="space-y-3">
        <SummaryCard label="Today" stats={today} loading={loadingStats} />
        <SummaryCard label="This week" stats={week} loading={loadingStats} />
      </section>

      {/* stat chips */}
      <section className="grid grid-cols-3 gap-3">
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

      {/* today jobs */}
      {jobs.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Today&apos;s jobs
            </h2>
            <Link
              href="/mobile/work-orders"
              className="text-[0.7rem] text-[var(--accent-copper-soft)] underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={job.href}
                  className="metal-card block rounded-2xl border border-[var(--metal-border-soft)] px-3 py-2 text-xs text-neutral-100"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-medium">{job.label}</div>
                    <span className="accent-chip rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-[var(--accent-copper-soft)]">
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
            href="/mobile/work-orders"
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
}: {
  loading: boolean;
  job: WorkOrderLine | null;
}) {
  if (loading) {
    return (
      <div className="metal-card inline-flex w-full items-center justify-between rounded-2xl border border-[var(--metal-border-soft)] px-3 py-2 text-[0.75rem] text-neutral-300">
        <span className="uppercase tracking-[0.16em] text-neutral-400">
          Current job
        </span>
        <span>Loading…</span>
      </div>
    );
  }

  if (!job || !job.work_order_id) {
    return (
      <div className="metal-card inline-flex w-full items-center justify-between rounded-2xl border border-[var(--metal-border-soft)] px-3 py-2 text-[0.75rem] text-neutral-400">
        <span className="uppercase tracking-[0.16em] text-neutral-400">
          Current job
        </span>
        <span className="text-[0.7rem] text-neutral-500">
          No active job punch
        </span>
      </div>
    );
  }

  const label =
    job.description ||
    job.complaint ||
    String(job.job_type ?? "Job in progress");

  const href = `/mobile/work-orders/${job.work_order_id}`;

  return (
    <Link
      href={href}
      className="metal-card flex items-center justify-between rounded-2xl border border-[var(--accent-copper-soft)] px-3 py-2 text-[0.8rem] text-neutral-100 shadow-[0_0_24px_rgba(212,118,49,0.45)]"
    >
      <div className="flex flex-col">
        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-[var(--accent-copper-soft)]">
          Current job
        </span>
        <span className="mt-0.5 truncate text-sm font-medium">{label}</span>
      </div>
      <span className="ml-3 text-xs text-[var(--accent-copper-soft)]">
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
  const base =
    "metal-card rounded-2xl px-3 py-3 shadow-[0_16px_32px_rgba(0,0,0,0.75)]";

  const variantClasses =
    variant === "accent"
      ? "border border-[var(--accent-copper-soft)]/80 shadow-[0_16px_32px_rgba(0,0,0,0.75),0_0_24px_rgba(212,118,49,0.55)]"
      : "border border-[var(--metal-border-soft)]";

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

function SummaryCard({
  label,
  stats,
  loading,
}: {
  label: string;
  stats: PeriodStats;
  loading?: boolean;
}) {
  const worked = stats.workedHours;
  const billed = stats.billedHours;
  const eff = stats.efficiencyPct;

  const workedText = loading ? "…" : `${worked.toFixed(1)} h`;
  const billedText = loading ? "…" : `${billed.toFixed(1)} h`;
  const effText = loading || eff === null ? "–" : `${eff.toFixed(0)}%`;

  return (
    <div className="metal-panel metal-panel--card rounded-2xl border border-[var(--metal-border-soft)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.75)]">
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
        <span className="font-semibold text-[var(--accent-copper-soft)]">
          {effText}
        </span>
      </div>
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
    classes =
      "border-[var(--metal-border-soft)] text-neutral-100 " +
      "bg-[linear-gradient(to_right,rgba(148,163,184,0.4),rgba(15,23,42,0.95))]";
  } else if (status === "active") {
    classes =
      "border-emerald-400/80 text-emerald-50 " +
      "bg-[linear-gradient(to_right,rgba(16,185,129,0.55),rgba(15,23,42,0.97))] " +
      "shadow-[0_0_16px_rgba(16,185,129,0.45)]";
  } else if (status === "break") {
    classes =
      "border-yellow-400/80 text-yellow-50 " +
      "bg-[linear-gradient(to_right,rgba(250,204,21,0.55),rgba(15,23,42,0.97))] " +
      "shadow-[0_0_16px_rgba(250,204,21,0.45)]";
  } else if (status === "lunch") {
    classes =
      "border-orange-400/80 text-orange-50 " +
      "bg-[linear-gradient(to_right,rgba(249,115,22,0.65),rgba(15,23,42,0.97))] " +
      "shadow-[0_0_16px_rgba(249,115,22,0.5)]";
  } else if (status === "ended") {
    // ended – red gradient
    classes =
      "border-red-500/80 text-red-50 " +
      "bg-[linear-gradient(to_right,rgba(239,68,68,0.7),rgba(15,23,42,0.97))] " +
      "shadow-[0_0_18px_rgba(239,68,68,0.55)]";
  } else {
    // none – subtle burnt copper
    classes =
      "border-[var(--accent-copper-soft)]/60 text-[var(--accent-copper-soft)] " +
      "bg-[linear-gradient(to_right,rgba(212,118,49,0.45),rgba(15,23,42,0.96))]";
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
      className="metal-card block rounded-2xl border border-[var(--metal-border-soft)] px-4 py-3 text-sm text-neutral-100 transition hover:border-[var(--accent-copper-soft)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
            {label}
          </div>
          <div className="mt-1 text-sm">{description}</div>
        </div>
        <span className="text-xs text-[var(--accent-copper-soft)]">›</span>
      </div>
    </Link>
  );
}