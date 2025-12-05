"use client";

import Link from "next/link";

type TileProps = {
  href: string;
  title: string;
  subtitle?: string;
  cta?: string;
};

function Tile({ href, title, subtitle, cta }: TileProps) {
  return (
    <Link
      href={href}
      aria-label={title}
      className="
        block rounded-2xl border
        border-[color:var(--metal-border-soft,#1f2937)]
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]
        px-4 py-3
        shadow-[0_18px_45px_rgba(0,0,0,0.9)]
        transition
        hover:-translate-y-1
        hover:border-[color:var(--accent-copper-light)]
        hover:shadow-[0_22px_60px_rgba(248,113,22,0.55)]
      "
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white sm:text-base">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-neutral-300 sm:text-sm">
              {subtitle}
            </p>
          ) : null}
        </div>

        {cta ? (
          <span
            className="
              inline-flex items-center justify-center
              rounded-full px-3 py-1
              text-[11px] font-semibold uppercase tracking-[0.18em]
              text-black
              bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))]
              shadow-[0_0_16px_rgba(248,113,22,0.75)]
            "
          >
            {cta}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export default function AdvisorDashboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black px-3 py-8 text-foreground">
      <div className="mx-auto max-w-6xl">
        {/* Page header */}
        <header className="mb-8 space-y-2">
          <div className="inline-flex items-center rounded-full border border-[color:var(--metal-border-soft)] bg-black/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
            Advisor Console
          </div>
          <h1
            className="text-3xl font-blackops tracking-[0.24em] text-[var(--accent-copper-light)] sm:text-4xl"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            Advisor Dashboard
          </h1>
          <p className="max-w-xl text-xs text-neutral-400 sm:text-sm">
            Jump straight into work orders, inspections, and bookings from one
            central panel.
          </p>
        </header>

        {/* Work Orders */}
        <section className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-300">
              Work Orders
            </h2>
            <span className="h-px flex-1 bg-gradient-to-r from-[var(--accent-copper-soft)]/70 via-neutral-700 to-transparent" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Tile
              href="/work-orders/create"
              title="Create Work Order"
              subtitle="Start a new job for a vehicle"
              cta="+"
            />
            <Tile
              href="/work-orders/customer"
              title="Customer Work Order Request"
              subtitle="Capture a customer request"
            />
            <Tile
              href="/work-orders/queue"
              title="Job Queue"
              subtitle="Active, paused, and in-progress jobs"
            />
            <Tile
              href="/work-orders/quote-review"
              title="Quote Review"
              subtitle="Review and send estimates"
            />
            <Tile
              href="/work-orders"
              title="View Work Orders"
              subtitle="Find & open specific work orders"
            />
            <Tile
              href="/work-orders"
              title="Open Work Order by ID"
              subtitle="Use list to select a specific ID"
            />
          </div>
        </section>

        {/* Inspections */}
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-300">
              Inspections
            </h2>
            <span className="h-px flex-1 bg-gradient-to-r from-[var(--accent-copper-soft)]/70 via-neutral-700 to-transparent" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Tile
              href="/inspections/templates"
              title="Templates"
              subtitle="Browse inspection templates"
            />
            <Tile
              href="/inspections/custom-inspection"
              title="Custom Inspection"
              subtitle="Build a custom checklist"
            />
            <Tile
              href="/inspections/created"
              title="Recently Created"
              subtitle="Newly started inspections"
            />
            <Tile
              href="/inspections/saved"
              title="Saved"
              subtitle="Draft inspections in progress"
            />
            <Tile
              href="/inspections/summary"
              title="Summaries"
              subtitle="Review inspection summaries"
            />
            <Tile
              href="/inspections/customer-vehicle"
              title="Customer & Vehicle"
              subtitle="Start from basic info"
            />
            <Tile
              href="/inspections"
              title="Open Inspection by ID"
              subtitle="Use list to select a specific ID"
            />
          </div>
        </section>

        {/* Booking */}
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-300">
              Booking
            </h2>
            <span className="h-px flex-1 bg-gradient-to-r from-[var(--accent-copper-soft)]/70 via-neutral-700 to-transparent" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Tile
              href="/dashboard/advisor/bookings"
              title="Bookings"
              subtitle="View & manage appointments"
            />
          </div>
        </section>
      </div>
    </div>
  );
}