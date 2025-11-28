 // features/mobile/dashboard/MobileTechHome.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
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

type ShiftStatus = "none" | "active" | "ended";

export function MobileTechHome({
  techName,
  role: _role, // kept for future role-specific tweaks
  stats,
  jobs,
  loadingStats = false,
}: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shiftStatus, setShiftStatus] = useState<ShiftStatus>("none");
  const [shiftStart, setShiftStart] = useState<string | null>(null);
  const [loadingShift, setLoadingShift] = useState(false);

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

  // Load current shift state for the chip
  useEffect(() => {
    void (async () => {
      setLoadingShift(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const userId = session?.user?.id ?? null;
        if (!userId) {
          setShiftStatus("none");
          setShiftStart(null);
          return;
        }

        const { data: openShift } = await supabase
          .from("tech_shifts")
          .select("id, start_time, end_time, type")
          .eq("user_id", userId)
          .eq("type", "shift")
          .is("end_time", null)
          .order("start_time", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openShift?.id) {
          setShiftStatus("active");
          setShiftStart(openShift.start_time);
        } else {
          setShiftStatus("none");
          setShiftStart(null);
        }
      } finally {
        setLoadingShift(false);
      }
    })();
  }, [supabase]);

  let chipLabel = "Off shift";
  let chipDetail: string | null = "Use the menu to start your day.";
  let chipVariant: "active" | "idle" = "idle";

  if (loadingShift) {
    chipLabel = "Checking shift…";
    chipDetail = null;
    chipVariant = "idle";
  } else if (shiftStatus === "active" && shiftStart) {
    const dt = new Date(shiftStart);
    const timeStr = dt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    chipLabel = "On shift";
    chipDetail = `since ${timeStr}`;
    chipVariant = "active";
  } else if (shiftStatus === "ended") {
    chipLabel = "Shift ended";
    chipDetail = null;
    chipVariant = "idle";
  }

  return (
    <div className="space-y-6 px-4 py-4 text-white">
      {/* header / hero */}
      <section className="metal-panel metal-panel--hero rounded-2xl border border-[var(--accent-copper-soft)]/60 bg-gradient-to-br from-[var(--accent-copper-deep)]/70 via-black to-slate-950/95 px-4 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.85)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black tracking-wide">
              <span className="text-neutral-100">Welcome back, </span>
              <span className="text-[var(--accent-copper-soft)]">
                {firstName}
              </span>{" "}
              <span aria-hidden="true">👋</span>
            </h1>
            <p className="mt-1 text-[0.75rem] text-neutral-200/85">
              Bench-side view of today&#39;s work and efficiency.
            </p>
          </div>
        </div>
        <div className="mt-3">
          <ShiftChip variant={chipVariant} label={chipLabel} detail={chipDetail} />
        </div>
      </section>

      {/* summary cards – worked vs billed */}
      <section className="space-y-3">
        <SummaryCard label="Today" stats={today} loading={loadingStats} />
        <SummaryCard label="This week" stats={week} loading={loadingStats} />
      </section>

      {/* stat chips */}
      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Open jobs" value={loadingStats ? "…" : openJobs} />
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
            <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Today&apos;s jobs
            </h2>
            <Link
              href="/mobile/work-orders"
              className="text-[0.7rem] font-medium text-[var(--accent-copper-soft)] underline-offset-4 hover:text-[var(--accent-copper-light)] hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={job.href}
                  className="block rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-neutral-100 shadow-card backdrop-blur-md transition hover:border-[var(--accent-copper-soft)]/80 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-medium">{job.label}</div>
                    <span className="rounded-full border border-[var(--accent-copper-soft)]/80 bg-[var(--accent-copper-deep)]/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-[var(--accent-copper-soft)]">
                      {job.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* tools – only My jobs + Team chat, full-width glass cards */}
      <section className="space-y-2">
        <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-neutral-400">
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

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950/90 via-black to-slate-900/90 px-3 py-3 shadow-card backdrop-blur-md">
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1 text-lg font-semibold">
        <span className="text-[var(--accent-copper-soft)]">{value}</span>
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
    <div className="metal-panel metal-panel--card rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950/95 via-black to-slate-900/95 px-4 py-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-300">
          {label} – Worked vs Billed
        </div>
        <div className="text-[0.7rem] text-neutral-400">
          Efficiency:{" "}
          <span className="font-semibold text-[var(--accent-copper-soft)]">
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

function ShiftChip({
  variant,
  label,
  detail,
}: {
  variant: "active" | "idle";
  label: string;
  detail?: string | null;
}) {
  const pillClass =
    variant === "active"
      ? "bg-gradient-to-r from-[var(--accent-copper-deep)] via-[var(--accent-copper-soft)]/85 to-emerald-600/70 border-[var(--accent-copper-soft)]/60 text-emerald-50"
      : "bg-white/5 border-white/15 text-neutral-100";

  const dotClass =
    variant === "active"
      ? "bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.9)]"
      : "bg-neutral-400";

  return (
    <div
      className={`inline-flex items-center gap-3 rounded-full px-3 py-1.5 text-[0.7rem] backdrop-blur-sm ${pillClass}`}
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span className="font-semibold uppercase tracking-[0.16em]">
        {label}
      </span>
      {detail ? (
        <span className="text-[0.65rem] text-neutral-100/80">{detail}</span>
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
      className="block rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-card backdrop-blur-md transition hover:border-[var(--accent-copper-soft)]/80 hover:bg-white/[0.08]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
            {label}
          </div>
          <div className="mt-1 text-sm text-neutral-100">{description}</div>
        </div>
        <span className="text-xs text-[var(--accent-copper-soft)]">›</span>
      </div>
    </Link>
  );
}