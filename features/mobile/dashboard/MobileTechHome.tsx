"use client";

import React from "react";
import type { MobileRole } from "@/features/mobile/config/mobile-tiles";
import { MobileRoleHub } from "@/features/mobile/components/MobileRoleHub";

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
  href: string;   // e.g. "/mobile/work-orders/123"
};

type Props = {
  techName: string;
  role: MobileRole;
  stats: MobileTechStats | null;
  jobs: MobileTechJob[];
  loadingStats?: boolean;
};

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
      </section>

      {/* summary cards – worked vs billed */}
      <section className="space-y-3">
        <SummaryCard
          label="Today"
          stats={today}
          loading={loadingStats}
        />
        <SummaryCard
          label="This week"
          stats={week}
          loading={loadingStats}
        />
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
              className="text-[0.7rem] text-orange-300 underline-offset-4 hover:underline"
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
                    <span className="rounded-full border border-orange-400/60 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-orange-200">
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-card">
      <div className="flex items-center justify-between">
        <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
          {label} – Worked vs Billed
        </div>
        <div className="text-[0.7rem] text-neutral-400">
          Efficiency:{" "}
          <span className="font-semibold text-orange-200">{effText}</span>
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
