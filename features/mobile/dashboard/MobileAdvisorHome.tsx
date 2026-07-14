// features/mobile/dashboard/MobileAdvisorHome.tsx
"use client";

import Link from "next/link";
import type { MobileRole } from "@/features/mobile/config/mobile-tiles";

type AdvisorStats = {
  awaitingApprovals: number;
  /** active work orders count (was 'waiters') */
  waiters: number;
  /** today's appointment count (was 'callbacks') */
  callbacks: number;
};

type Props = {
  advisorName: string;
  role: MobileRole;
  stats?: AdvisorStats;
};

export default function MobileAdvisorHome({
  advisorName,
  role: _role,
  stats,
}: Props) {
  const firstName = advisorName?.split(" ")[0] ?? advisorName ?? "Advisor";

  const { awaitingApprovals, waiters: activeWos, callbacks: todaysAppts } =
    stats ?? {
      awaitingApprovals: 0,
      waiters: 0,
      callbacks: 0,
    };

  return (
    <div className="space-y-6 px-4 py-4">
      {/* Hero */}
      <section className="metal-panel metal-panel--hero rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)]">
        <div className="space-y-4">
          <div className="text-center">
            <h1 className="text-xl font-semibold leading-tight">
              <span className="text-[color:var(--theme-text-primary)]">Welcome back, </span>
              <span className="text-[var(--accent-copper)]">{firstName}</span>{" "}
              <span className="align-middle">📋</span>
            </h1>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              Bench-side view of approvals, active work orders and today&apos;s
              appointments.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <SummaryChip
              label="Awaiting approval"
              value={awaitingApprovals}
              accent
            />
            <SummaryChip label="Active WOs" value={activeWos} />
            <SummaryChip label="Appts today" value={todaysAppts} />
          </div>
        </div>
      </section>

      {/* Work focus cards – view, create, appointments, messages */}
      <section className="space-y-3">
        <FocusCard
          title="Work order view"
          body="Open the mobile work order board to manage jobs and assign techs."
          href="/mobile/work-orders"
          cta="Open work orders"
        />
        <FocusCard
          title="Create work order"
          body="Start a new work order from the counter or phone."
          href="/mobile/work-orders/create"
          cta="New work order"
        />
        <FocusCard
          title="Today’s appointments"
          body="See today’s bookings and add drop-offs on the fly."
          href="/mobile/appointments"
          cta="Open appointments"
        />
        <FocusCard
          title="Messages & chat"
          body="Stay in sync with techs, parts and management."
          href="/mobile/messages"
          cta="Open messages"
        />
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
    "metal-card rounded-2xl px-3 py-3 shadow-[var(--theme-shadow-medium)] text-center";
  const variant = accent
    ? "border border-[var(--accent-copper-soft)] text-[var(--accent-copper-soft)] shadow-[var(--theme-shadow-medium)]"
    : "border border-[var(--metal-border-soft)] text-[color:var(--theme-text-primary)]";

  return (
    <div className={`${base} ${variant}`}>
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
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
      className="metal-card block rounded-2xl border border-[var(--metal-border-soft)] px-4 py-3 text-sm text-[color:var(--theme-text-primary)] transition hover:border-[var(--accent-copper-soft)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            {title}
          </div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-primary)]">{body}</div>
        </div>
        <span className="text-[0.7rem] text-[var(--accent-copper-soft)]">
          {cta} →
        </span>
      </div>
    </Link>
  );
}