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

  const { techsOnShift, jobsInProgress, jobsBlocked } =
    stats ?? {
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
              Quick view of tech coverage, in-progress work and blockers.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <StatChip label="Techs on shift" value={techsOnShift} accent />
            <StatChip label="In progress" value={jobsInProgress} />
            <StatChip label="Blocked" value={jobsBlocked} warn />
          </div>
        </div>
      </section>

      {/* Core flows – same as manager */}
      <section className="space-y-3">
        <ActionCard
          title="Work order queue"
          body="Review jobs in the queue and balance workload."
          href="/work-orders/queue"
          cta="Open job queue"
        />
        <ActionCard
          title="Create work order"
          body="Spin up a new job when vehicles land."
          href="/work-orders/create?autostart=1"
          cta="New work order"
        />
        <ActionCard
          title="Appointments"
          body="Check today’s appointments and what’s arriving next."
          href="/mobile/appointments"
          cta="Open appointments"
        />
        <ActionCard
          title="Messages & chat"
          body="Coordinate with advisors, techs and parts."
          href="/mobile/messages"
          cta="Open messages"
        />
      </section>

      {/* Shortcuts from config – same scopes as manager */}
      <MobileRoleHub
        role={role}
        scopes={["work_orders", "appointments", "all"]}
        title="Lead-hand shortcuts"
        subtitle="Hands-on tools for keeping the floor moving."
      />
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