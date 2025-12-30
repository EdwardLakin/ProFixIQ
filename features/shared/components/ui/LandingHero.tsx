// features/shared/components/ui/LandingHero.tsx
"use client";

import Link from "next/link";

const COPPER = "var(--pfq-copper)";

export default function LandingHero() {
  return (
    <section className="relative mx-auto max-w-5xl px-4 py-20 sm:py-24">
      {/* Glass hero card */}
      <div
        className="
          relative mx-auto max-w-4xl
          overflow-hidden rounded-[32px]
          border border-[color:var(--metal-border-soft,#1f2937)]
          bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.20),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_85%)]
          px-6 py-8 sm:px-10 sm:py-12
          shadow-[0_32px_80px_rgba(0,0,0,0.95)]
          backdrop-blur-2xl
        "
      >
        <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/5" />

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Heading */}
          <div className="space-y-2">
            <h1
              className="text-4xl leading-tight sm:text-5xl md:text-6xl"
              style={{
                fontFamily: "var(--font-blackops)",
                color: COPPER,
                textShadow:
                  "0 0 26px rgba(197,122,74,0.75), 0 0 60px rgba(0,0,0,0.85)",
              }}
            >
              ProFixIQ
            </h1>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-300">
              Inspections • Work Orders • AI • Portal
            </p>
          </div>

          {/* Main line */}
          <h2 className="mt-6 text-xl font-semibold text-neutral-50 sm:text-2xl md:text-3xl">
            From bay floor to fleet portal.
          </h2>

          {/* Subcopy */}
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-300 sm:text-base">
            Drop in your existing history and let the AI show you what your shop is
            already great at — top repairs, missed packages, and ready-to-use menus
            before you even move your first work order.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {/* Primary: Instant Shop Analysis demo */}
            <Link
              href="/demo/instant-shop-analysis"
              className="
                rounded-full px-5 py-2.5 text-sm font-semibold text-black
                shadow-[0_0_26px_rgba(212,118,49,0.9)]
                hover:brightness-110
              "
              style={{
                background:
                  "linear-gradient(to right,var(--accent-copper-soft),var(--accent-copper))",
              }}
            >
              Run Instant Shop Analysis
            </Link>

            {/* Keep portals as secondary links */}
            <Link
              href="/portal"
              className="
                rounded-full border border-white/12 bg-black/50
                px-5 py-2.5 text-sm font-semibold text-neutral-100
                backdrop-blur-lg transition
                hover:bg-black/70
              "
            >
              Customer portal
            </Link>

            <Link
              href="/portal/fleet"
              className="
                rounded-full border border-white/12 bg-black/40
                px-5 py-2.5 text-sm font-semibold text-neutral-100
                backdrop-blur-lg transition
                hover:bg-black/70
              "
            >
              Fleet portal
            </Link>
          </div>

          {/* Mini feature strip */}
          <div className="mt-8 grid w-full gap-3 text-[11px] text-neutral-400 sm:grid-cols-3">
            <div className="flex items-center justify-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              Instant Shop Analysis in minutes
            </div>
            <div className="flex items-center justify-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              HD inspections, corner grids &amp; pre-trips
            </div>
            <div className="flex items-center justify-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              Customer &amp; fleet portal with live status
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}