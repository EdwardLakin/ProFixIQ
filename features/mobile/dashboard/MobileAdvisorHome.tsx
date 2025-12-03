"use client";

import React from "react";
import Link from "next/link";
import type { MobileRole } from "@/features/mobile/config/mobile-tiles";
import { MobileRoleHub } from "@/features/mobile/components/MobileRoleHub";

type AdvisorStats = {
  awaitingApprovals: number;
  waiters: number;
  callbacks: number;
};

type Props = {
  advisorName: string;
  role: MobileRole;
  stats?: AdvisorStats;
};

export default function MobileAdvisorHome({
  advisorName,
  role,
  stats,
}: Props) {
  const firstName = advisorName?.split(" ")[0] ?? advisorName ?? "Advisor";

  const {
    awaitingApprovals,
    waiters,
    callbacks,
  } = stats ?? {
    awaitingApprovals: 0,
    waiters: 0,
    callbacks: 0,
  };

  return (
    <div className="space-y-6 px-4 py-4">
      {/* Hero */}
      <section className="metal-panel metal-panel--hero rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 text-white shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <div className="space-y-4">
          <div className="text-center">
            <h1 className="text-xl font-semibold leading-tight">
              <span className="text-neutral-100">Welcome back, </span>
              <span className="text-[var(--accent-copper)]">{firstName}</span>{" "}
              <span className="align-middle">📋</span>
            </h1>
            <p className="mt-1 text-xs text-neutral-300">
              Bench-side view of approvals, waiters and customer follow-ups.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <SummaryChip
              label="Awaiting approval"
              value={awaitingApprovals}
              accent
            />
            <SummaryChip label="Waiters" value={waiters} />
            <SummaryChip label="Callbacks" value={callbacks} />
          </div>
        </div>
      </section>

      {/* Work focus cards */}
      <section className="space-y-3">
        <FocusCard
          title="Approvals pipeline"
          body="Review estimates, send to customers, and track responses in one place."
          href="/work-orders/quote-review"
          cta="Open quote review"
        />
        <FocusCard
          title="Waiting customers"
          body="Prioritize waiter jobs and keep customers updated on timing."
          href="/work-orders/view?filter=waiters"
          cta="View waiter work orders"
        />
      </section>

      {/* Shortcuts from config */}
      <MobileRoleHub
        role={role}
        scopes={["work_orders", "appointments", "inspections", "all"]}
        title="Advisor shortcuts"
        subtitle="High-impact actions for the front counter."
      />

      {/* Tools */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Tools
        </h2>
        <p className="text-[0.7rem] text-neutral-500">
          Day-to-day utilities you&apos;ll use often.
        </p>
        <div className="space-y-2">
          <ToolCard
            href="/work-orders/view"
            label="Work order list"
            description="Browse and manage jobs"
          />
          <ToolCard
            href="/portal/appointments"
            label="Appointments"
            description="Today&apos;s bookings & drop-offs"
          />
        </div>
      </section>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  const base =
    "metal-card rounded-2xl px-3 py-3 shadow-[0_16px_32px_rgba(0,0,0,0.75)] text-center";
  const variant = accent
    ? "border border-[var(--accent-copper-soft)] text-[var(--accent-copper-soft)] shadow-[0_16px_32px_rgba(0,0,0,0.75),0_0_24px_rgba(212,118,49,0.55)]"
    : "border border-[var(--metal-border-soft)] text-neutral-100";

  return (
    <div className={`${base} ${variant}`}>
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function FocusCard({
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
