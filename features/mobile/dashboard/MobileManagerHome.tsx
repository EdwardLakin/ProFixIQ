"use client";

import React from "react";
import Link from "next/link";
import type { MobileRole } from "@/features/mobile/config/mobile-tiles";
import { MobileRoleHub } from "@/features/mobile/components/MobileRoleHub";

type ManagerStats = {
  activeWos: number;
  waiters: number;
  techniciansOnShift: number;
  /** Optional: today’s billed total as a string (e.g. "$3,420") */
  todayBilled?: string | null;
};

type Props = {
  managerName: string;
  role: MobileRole;
  stats?: ManagerStats;
};

export default function MobileManagerHome({ managerName, role, stats }: Props) {
  const firstName = managerName?.split(" ")[0] ?? managerName ?? "Manager";

  const {
    activeWos,
    waiters,
    techniciansOnShift,
    todayBilled,
  } = stats ?? {
    activeWos: 0,
    waiters: 0,
    techniciansOnShift: 0,
    todayBilled: null,
  };

  return (
    <div className="space-y-6 px-4 py-4">
      {/* Hero */}
      <section className="metal-panel metal-panel--hero rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 text-white shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <div className="space-y-4">
          <div className="text-center">
            <h1 className="text-xl font-semibold leading-tight">
              <span className="text-neutral-100">Shop overview, </span>
              <span className="text-[var(--accent-copper)]">{firstName}</span>{" "}
              <span className="align-middle">📊</span>
            </h1>
            <p className="mt-1 text-xs text-neutral-300">
              High-level view of workload, waiters and technician coverage.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <ManagerStatChip label="Active WOs" value={activeWos} />
            <ManagerStatChip label="Waiters" value={waiters} warn={waiters > 0} />
            <ManagerStatChip
              label="Techs on shift"
              value={techniciansOnShift}
              accent={techniciansOnShift > 0}
            />
          </div>

          <div className="mt-1 text-center text-[0.75rem] text-neutral-300">
            Today billed:{" "}
            <span className="font-semibold text-[var(--accent-copper-soft)]">
              {todayBilled ?? "—"}
            </span>
          </div>
        </div>
      </section>

      {/* Key flows */}
      <section className="space-y-3">
        <FlowCard
          title="Today&apos;s workload"
          body="See work orders in flight and where capacity is tight."
          href="/work-orders/queue"
          cta="Open job queue"
        />
        <FlowCard
          title="Billing & cashflow"
          body="Review jobs ready to invoice and keep the day closing on time."
          href="/billing"
          cta="View billing queue"
        />
        <FlowCard
          title="Appointments & demand"
          body="Look ahead at tomorrow&apos;s bookings and bay loading."
          href="/portal/appointments"
          cta="Open appointments"
        />
      </section>

      {/* Shortcuts from config */}
      <MobileRoleHub
        role={role}
        scopes={["work_orders", "management", "appointments", "parts", "all"]}
        title="Manager shortcuts"
        subtitle="Operations, appointments, and parts at a glance."
      />

      {/* Tools */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Tools
        </h2>
        <p className="text-[0.7rem] text-neutral-500">
          Quick links you&apos;ll jump into throughout the day.
        </p>
        <div className="space-y-2">
          <ToolCard
            href="/work-orders/view"
            label="Work order list"
            description="Full list & search"
          />
          <ToolCard
            href="/dashboard/admin/scheduling"
            label="Scheduling"
            description="Calendar & bay loading"
          />
          <ToolCard
            href="/parts"
            label="Parts dashboard"
            description="Orders, receiving & issues"
          />
        </div>
      </section>
    </div>
  );
}

function ManagerStatChip({
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

function FlowCard({
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
