"use client";

import Link from "next/link";

export default function FleetControlTowerPage() {
  const headerCard =
    "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
    "bg-black/70 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl";

  const listCard =
    "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
    "bg-black/70 shadow-[0_20px_70px_rgba(0,0,0,0.95)] backdrop-blur-xl";

  return (
    <div className="px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        {/* Copper wash */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
        />

        {/* Header */}
        <div className={headerCard + " relative overflow-hidden px-4 py-4 md:px-6 md:py-5"}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-10 h-24 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.22),transparent_65%)]"
          />

          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1
                className="text-xl font-bold tracking-[0.22em] text-[rgba(248,113,22,0.9)] md:text-2xl uppercase"
                style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
              >
                Fleet Control Tower
              </h1>
              <p className="mt-1 text-xs text-neutral-300">
                High-level health view for tractors, trailers, buses and recurring issues.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
              <span className="rounded-full border border-neutral-700/80 bg-black/60 px-3 py-1 uppercase tracking-[0.16em]">
                Fleet
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className={listCard + " px-4 py-4 md:px-6 md:py-5"}>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                Overview
              </h2>
              <p className="text-xs text-neutral-300">
                This screen will surface AI summaries of unit health, recurring defects and
                service risk. For now, use the shortcuts below to jump into the active Fleet tools.
              </p>
              <ul className="mt-2 space-y-2 text-xs text-neutral-300">
                <li>• Daily pre-trip defects and DVIR issues</li>
                <li>• Units out of service or overdue for maintenance</li>
                <li>• Open fleet service requests mapped back to work orders</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                Quick links
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <Link
                  href="/fleet/dispatch"
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs shadow-card hover:border-white/20"
                >
                  <div className="uppercase tracking-[0.16em] text-[0.7rem] text-neutral-400">
                    Dispatch Board
                  </div>
                  <p className="mt-1 text-[0.7rem] text-neutral-300">
                    Assign units and routes.
                  </p>
                </Link>
                <Link
                  href="/fleet/pretrip"
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs shadow-card hover:border-white/20"
                >
                  <div className="uppercase tracking-[0.16em] text-[0.7rem] text-neutral-400">
                    Pre-trip Reports
                  </div>
                  <p className="mt-1 text-[0.7rem] text-neutral-300">
                    Review daily driver checklists.
                  </p>
                </Link>
                <Link
                  href="/fleet/units"
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs shadow-card hover:border-white/20"
                >
                  <div className="uppercase tracking-[0.16em] text-[0.7rem] text-neutral-400">
                    Fleet Units
                  </div>
                  <p className="mt-1 text-[0.7rem] text-neutral-300">
                    Jump to HD tractors, trailers, buses.
                  </p>
                </Link>
                <Link
                  href="/fleet/service-requests"
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs shadow-card hover:border-white/20"
                >
                  <div className="uppercase tracking-[0.16em] text-[0.7rem] text-neutral-400">
                    Service Requests
                  </div>
                  <p className="mt-1 text-[0.7rem] text-neutral-300">
                    From pre-trips & inspection defects.
                  </p>
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
