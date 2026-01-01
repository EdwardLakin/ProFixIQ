// app/fleet/pretrip/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";

export default function FleetPretripPage() {
  const card =
    "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
    "bg-black/70 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl";

  return (
    <main className="min-h-[calc(100vh-3rem)] px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        {/* Copper wash from dashboard theme */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
        />

        {/* Header */}
        <div className={card + " relative overflow-hidden px-4 py-4 md:px-6 md:py-5"}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-10 h-24 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.22),transparent_65%)]"
          />
          <div className="relative flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1
                className="text-xl font-bold tracking-[0.22em] text-[rgba(248,113,22,0.9)] md:text-2xl uppercase"
                style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
              >
                Pre-trip Reports
              </h1>
              <p className="mt-1 text-xs text-neutral-300">
                View and audit daily DVIR / pre-trip reports coming in from drivers.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-neutral-400">
              <span className="rounded-full border border-neutral-700 bg-black/50 px-3 py-1 uppercase tracking-[0.16em]">
                Fleet
              </span>
              <span className="rounded-full border border-neutral-700 bg-black/50 px-3 py-1 uppercase tracking-[0.16em]">
                Inspections
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className={card + " px-4 py-4 md:px-6 md:py-5"}>
          <p className="text-xs text-neutral-300">
            This page will host filters, tables and AI summaries of pre-trip defects. For
            now it&apos;s wired so navigation and permissions work cleanly.
          </p>
          <p className="mt-3 text-xs text-neutral-400">
            Drivers can submit pre-trips from{" "}
            <Link
              href="/mobile/fleet/pretrip"
              className="underline decoration-dotted underline-offset-4"
            >
              the mobile pre-trip screen
            </Link>
            . Those records will surface here once the table view is plugged in.
          </p>
        </div>
      </div>
    </main>
  );
}