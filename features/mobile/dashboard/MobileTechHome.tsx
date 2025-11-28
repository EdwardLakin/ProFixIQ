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
  role: _role, // reserved for future role-specific tweaks
  stats,
  jobs,
  loadingStats = false,
}: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shiftStatus, setShiftStatus] = useState<ShiftStatus>("none");
  const [shiftStart, setShiftStart] = useState<string | null>(null);
  const [loadingShift, setLoadingShift] = useState(false);

  const [currentTime, setCurrentTime] = useState<string>("");

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

  // Live current time for the header
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    };
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, []);

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
    <div className="space-y-6 px-4 py-4">
      {/* current time */}
      <div className="flex justify-center">
        <div className="rounded-full border border-white/10 bg-black/70 px-3 py-1 text-[0.65rem] font-medium tracking-[0.16em] text-neutral-300 shadow-[0_12px_28px_rgba(0,0,0,0.9)]">
          {currentTime}
        </div>
      </div>

      {/* header / hero */}
      <section className="metal-panel metal-panel--hero rounded-2xl border border-[var(--accent-copper-soft)]/80 px-4 py-4 text-white shadow-[0_18px_40px_rgba(0,0,0,0.95),0_0_26px_rgba(212,118,49,0.35)]">
        <div className="space-y-3">
          <div>
            <h1 className="text-xl font-semibold leading-tight">
              <span className="text-[var(--accent-copper)]">
                {`Welcome back, ${firstName}`}
              </span>{" "}
              <span className="align-middle">👋</span>
            </h1>
            <p className="mt-1 text-xs text-neutral-300">
              Bench-side view of today’s work and efficiency.
            </p>
          </div>
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
                  className="block rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-neutral-100 shadow-[0_18px_40px_rgba(0,0,0,0.9)] backdrop-blur-md"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-medium">{job.label}</div>
                    <span className="rounded-full border border-[var(--accent-copper-soft)]/70 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-[var(--accent-copper-soft)]">
                      {job.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* tools – My jobs + Team chat */}
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
    "rounded-2xl px-3 py-3 backdrop-blur-md shadow-[0_16px_40px_rgba(0,0,0,0.95)]";

  const variantClasses =
    variant === "accent"
      ? "border border-[var(--accent-copper-soft)]/85 bg-white/[0.04] shadow-[0_16px_40px_rgba(0,0,0,0.95),0_0_28px_rgba(212,118,49,0.6)]"
      : "border border-white/10 bg-white/[0.03]";

  return (
    <div className={`${base} ${variantClasses}`}>
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
  const effText = loading || eff === null ? "–" : `${eff.toFixed(0)}%`;

  return (
    <div className="metal-panel metal-panel--card rounded-2xl border border-[var(--accent-copper-soft)]/55 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.95)] backdrop-blur-md">
      <div className="flex items-center justify-between">
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
  // rectangular, copper gradient when idle; green accent when active
  const base =
    "inline-flex w-full max-w-xs items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[0.7rem] font-medium shadow-[0_10px_24px_rgba(0,0,0,0.9)]";

  const idleClasses =
    "border-[var(--accent-copper-soft)] bg-[linear-gradient(135deg,#d9783a,#b35422)] text-black";
  const activeClasses =
    "border-emerald-400/80 bg-[linear-gradient(135deg,#059669,#16a34a)] text-emerald-50";

  const pillClass = `${base} ${
    variant === "active" ? activeClasses : idleClasses
  }`;

  const dotClass =
    variant === "active"
      ? "bg-emerald-100 shadow-[0_0_8px_rgba(16,185,129,0.9)]"
      : "bg-black/40";

  return (
    <div className={pillClass}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <span className="uppercase tracking-[0.16em]">{label}</span>
      </div>
      {detail ? (
        <span className="text-[0.65rem] opacity-85">{detail}</span>
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
      className="block rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-neutral-100 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-md transition hover:border-[var(--accent-copper-soft)] hover:bg-white/[0.07]"
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