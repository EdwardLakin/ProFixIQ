"use client";

import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { MobileRole } from "@/features/mobile/config/mobile-tiles";
import { MobileRoleHub } from "@/features/mobile/components/MobileRoleHub";

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

type ShiftStatus = "none" | "active" | "ended";

export function MobileTechHome({
  techName,
  role,
  stats,
  jobs,
  loadingStats = false,
}: Props) {
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

  // ── Shift chip state (reads from tech_shifts) ──────────────────────────────
  const [shiftStatus, setShiftStatus] = useState<ShiftStatus>("none");
  const [shiftStart, setShiftStart] = useState<string | null>(null);
  const [loadingShift, setLoadingShift] = useState<boolean>(true);

  useEffect(() => {
    const loadShift = async () => {
      try {
        const supabase = createClientComponentClient<DB>();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const userId = session?.user?.id;
        if (!userId) {
          setShiftStatus("none");
          setShiftStart(null);
          return;
        }

        // latest shift for this user
        const { data: lastShift } = await supabase
          .from("tech_shifts")
          .select("start_time, end_time")
          .eq("user_id", userId)
          .order("start_time", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!lastShift) {
          setShiftStatus("none");
          setShiftStart(null);
          return;
        }

        if (lastShift.end_time === null) {
          setShiftStatus("active");
          setShiftStart(lastShift.start_time ?? null);
        } else {
          setShiftStatus("ended");
          setShiftStart(lastShift.start_time ?? null);
        }
      } finally {
        setLoadingShift(false);
      }
    };

    void loadShift();
  }, []);

  return (
    <div className="px-4 py-4 space-y-6">
      {/* header */}
      <section className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.95),#020617_70%)] px-4 py-4 shadow-card text-white">
        <h1 className="text-xl font-semibold">
          {`Welcome back, ${firstName} 👋`}
        </h1>
        <p className="mt-1 text-xs text-neutral-300">
          Bench view of today’s work.
        </p>

        {/* Today’s clock / shift chip */}
        <div className="mt-3">
          <ShiftChip
            status={shiftStatus}
            startTime={shiftStart}
            loading={loadingShift}
          />
        </div>
      </section>

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
        />
        <StatCard
          label="Assigned"
          value={loadingStats ? "…" : assignedJobs}
        />
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
            <a
              href="/mobile/work-orders"
              className="text-[0.7rem] text-[var(--accent-copper-light)] underline-offset-4 hover:underline"
            >
              View all
            </a>
          </div>
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.id}>
                <a
                  href={job.href}
                  className="block rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-neutral-100 shadow-card"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-medium">{job.label}</div>
                    <span className="rounded-full border border-[var(--accent-copper-light)]/80 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-[var(--accent-copper-light)]">
                      {job.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* mobile role hub */}
      <MobileRoleHub
        role={role}
        scopes={["home"]}
        title="Tools"
        subtitle="Quick actions for your bench."
      />
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 shadow-card">
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1 text-lg font-semibold text-white">
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
  const effText =
    loading || eff === null ? "–" : `${eff.toFixed(0)}%`;

  return (
    <div className="metal-panel metal-panel--card rounded-2xl border px-4 py-3 shadow-card">
      <div className="flex items-center justify-between">
        <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
          {label} – Worked vs Billed
        </div>
        <div className="text-[0.7rem] text-neutral-400">
          Efficiency:{" "}
          <span className="font-semibold text-[var(--accent-copper-light)]">
            {effText}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-baseline gap-4 text-sm text-neutral-100">
        <div>
          <span className="text-neutral-400">Worked</span>{" "}
          <span className="font-semibold text-white">{workedText}</span>
        </div>
        <div>
          <span className="text-neutral-400">Billed</span>{" "}
          <span className="font-semibold text-white">{billedText}</span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Shift Chip ──────────────────────────────── */

function ShiftChip({
  status,
  startTime,
  loading,
}: {
  status: ShiftStatus;
  startTime: string | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[0.7rem] text-neutral-300">
        <span className="h-2 w-2 animate-pulse rounded-full bg-neutral-400" />
        <span>Checking today&apos;s clock…</span>
      </div>
    );
  }

  let badgeClass =
    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.7rem]";
  let pillDotClass = "h-2 w-2 rounded-full";
  let label = "";
  let detail = "";

  const timeLabel =
    startTime != null
      ? new Date(startTime).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  if (status === "active") {
    badgeClass +=
      " border-emerald-500/70 bg-emerald-500/10 text-emerald-100";
    pillDotClass += " bg-emerald-400";
    label = "On shift";
    detail = timeLabel ? `since ${timeLabel}` : "clock running";
  } else if (status === "ended") {
    badgeClass +=
      " border-[var(--accent-copper)]/70 bg-black/40 text-neutral-200";
    pillDotClass += " bg-[var(--accent-copper-light)]";
    label = "Shift ended";
    detail = timeLabel ? `started at ${timeLabel}` : "no active shift";
  } else {
    badgeClass +=
      " border-white/15 bg-black/40 text-neutral-300";
    pillDotClass += " bg-neutral-400";
    label = "Off shift";
    detail = "tap punch button to start";
  }

  return (
    <div className={badgeClass}>
      <span className={pillDotClass} />
      <span className="font-semibold uppercase tracking-[0.15em]">
        {label}
      </span>
      <span className="text-[0.65rem] text-neutral-300">{detail}</span>
    </div>
  );
}