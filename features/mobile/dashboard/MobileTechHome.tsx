// features/mobile/dashboard/MobileTechHome.tsx
"use client";

import React from "react";
import type { MobileRole } from "@/features/mobile/config/mobile-tiles";
import { MobileRoleHub } from "@/features/mobile/components/MobileRoleHub";

export type MobileTechStats = {
  openJobs: number;
  jobsCompletedToday: number;
  hoursWorkedToday: number;
  hoursBookedToday: number;
};

export type MobileTechJob = {
  id: string;
  label: string; // e.g. "2018 F-150 – Brakes"
  status: string; // e.g. "In progress"
  href: string;   // e.g. "/mobile/work-orders/123"
};

type Props = {
  techName: string;
  role: MobileRole;
  stats: MobileTechStats;
  jobs: MobileTechJob[];
};

export function MobileTechHome({ techName, role, stats, jobs }: Props) {
  const firstName = techName?.split(" ")[0] ?? techName ?? "Tech";

  const efficiency =
    stats.hoursBookedToday > 0
      ? Math.round((stats.hoursWorkedToday / stats.hoursBookedToday) * 100)
      : null;

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

      {/* stat cards */}
      <section className="grid grid-cols-2 gap-3">
        <StatCard label="Open jobs" value={stats.openJobs} />
        <StatCard label="Jobs done" value={stats.jobsCompletedToday} />
        <StatCard
          label="Hours worked"
          value={stats.hoursWorkedToday.toFixed(1)}
          suffix="h"
        />
        <StatCard
          label="Hours billed"
          value={stats.hoursBookedToday.toFixed(1)}
          suffix="h"
        />
        <StatCard
          label="Efficiency"
          value={efficiency !== null ? efficiency : "–"}
          suffix={efficiency !== null ? "%" : ""}
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
                      {job.status}
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
  suffix,
}: {
  label: string;
  value: number | string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 shadow-card">
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1 text-lg font-semibold text-white">
        <span>{value}</span>
        {suffix && (
          <span className="text-[0.7rem] font-normal text-neutral-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}