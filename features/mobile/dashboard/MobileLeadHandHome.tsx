"use client";

import React from "react";
import Link from "next/link";
import type { MobileRole } from "@/features/mobile/config/mobile-tiles";
import { MobileRoleHub } from "@/features/mobile/components/MobileRoleHub";

type LeadHandStats = {
  techsOnShift: number;
  jobsInProgress: number;
  jobsBlocked: number;
};

type Props = {
  leadName: string;
  role: MobileRole;
  stats?: LeadHandStats;
};

export default function MobileLeadHandHome({ leadName, role, stats }: Props) {
  const firstName = leadName?.split(" ")[0] ?? leadName ?? "Lead";

  const {
    techsOnShift,
    jobsInProgress,
    jobsBlocked,
  } = stats ?? {
    techsOnShift: 0,
    jobsInProgress: 0,
    jobsBlocked: 0,
  };

  return (
    <div className="space-y-6 px-4 py-4">
      {/* Hero */}
      <section className="metal-panel metal-panel--hero rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 text-white shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <div className="space-y-4">
          <div className="text-center">
            <h1 className="text-xl font-semibold leading-tight">
              <span className="text-neutral-100">Shop floor, </span>
              <span className="text-[var(--accent-copper)]">{firstName}</span>{" "}
              <span className="align-middle">🧰</span>
            </h1>
            <p className="mt-1 text-xs text-neutral-300">
              Quick view of techs, in-progress work and blockers.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <StatChip label="Techs on shift" value={techsOnShift} accent />
            <StatChip label="In progress" value={jobsInProgress} />
            <StatChip label="Blocked" value={jobsBlocked} warn />
          </div>
        </div>
      </section>

      {/* Focused actions */}
      <section className="space-y-3">
        <ActionCard
          title="Assign & balance work"
          body="Review tech queues and balance workload across the bay."
          href="/work-orders/queue"
          cta="Open job queue"
        />
        <ActionCard
          title="Unblock jobs"
          body="Find jobs on hold for parts, info or approvals and keep flow moving."
          href="/work-orders/view?filter=on_hold"
          cta="View blocked jobs"
        />
      </section>

      {/* Shortcuts from config */}
      <MobileRoleHub
        role={role}
        scopes={["work_orders", "inspections", "all"]}
        title="Lead-hand shortcuts"
        subtitle="Hands-on tools for keeping the floor moving."
      />

      {/* Tools */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Tools
        </h2>
        <p className="text-[0.7rem] text-neutral-500">
          Views you&apos;ll jump into a lot during the day.
        </p>
        <div className="space-y-2">
          <ToolCard
            href="/tech/queue"
            label="Tech job queue"
            description="Per-tech workload & active jobs"
          />
          <ToolCard
            href="/parts/requests"
            label="Parts requests"
            description="Jobs waiting on parts"
          />
        </div>
      </section>
    </div>
  );
}

function StatChip({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: number;
  accent?: boolean;
  warn?: boolean;
}) {
  const base =
    "metal-card rounded-2xl px-3 py-3 shadow-[0_16px_32px_rgba(0,0,0,0.75)] text-center border";

  let color = "border-[var(--metal-border-soft)] text-neutral-100";
  if (accent) {
    color =
      "border-emerald-400/70 text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.55)]";
  } else if (warn && value > 0) {
    color =
      "border-red-500/80 text-red-100 shadow-[0_0_18px_rgba(239,68,68,0.55)]";
  }

  return (
    <div className={`${base} ${color}`}>
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function ActionCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="metal-card block rounded-2xl border border-[var(--metal-border-soft)] px-4 py-3 text-sm text-neutral-100 transition hover:border-[var(--accent-copper-soft)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
            {title}
          </div>
          <div className="mt-1 text-xs text-neutral-200">{body}</div>
        </div>
        <span className="text-[0.7rem] text-[var(--accent-copper-soft)]">
          {cta} →
        </span>
      </div>
    </Link>
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
