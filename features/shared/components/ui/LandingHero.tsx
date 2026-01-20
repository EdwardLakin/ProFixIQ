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
          {/* New: Category line above brand */}
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.28em]"
            style={{ color: "var(--accent-copper-light)" }}
          >
            Heavy-Duty &amp; Fleet Shop OS
          </div>

          {/* Brand */}
          <div className="mt-3 space-y-2">
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
              Inspections • Work Orders • Automation • Portals • AI
            </p>
          </div>

          {/* New: Outcome-driven headline */}
          <h2 className="mt-6 text-xl font-semibold text-neutral-50 sm:text-2xl md:text-3xl">
            Run your heavy-duty shop like a fleet operation.
          </h2>

          {/* New: Subcopy that sells your unfair advantage */}
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-300 sm:text-base">
            Upload your history once and ProFixIQ builds your shop from day one —
            inspections, service menus, workflow automation, and portals. Less screen
            time for techs. Faster approvals. Cleaner evidence and billing.
          </p>

          {/* CTAs: simplify to primary + one secondary */}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
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

            <Link
              href="#features"
              className="
                rounded-full border border-white/12 bg-black/45
                px-5 py-2.5 text-sm font-semibold text-neutral-100
                backdrop-blur-lg transition
                hover:bg-black/70
              "
            >
              See what’s included
            </Link>
          </div>

          {/* Portal links: de-emphasized (still visible) */}
          <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs text-neutral-400">
            <Link href="/portal" className="underline decoration-white/20 underline-offset-4 hover:text-neutral-200">
              Customer portal
            </Link>
            <span className="text-white/10">•</span>
            <Link href="/portal/fleet" className="underline decoration-white/20 underline-offset-4 hover:text-neutral-200">
              Fleet portal
            </Link>
            <span className="text-white/10">•</span>
            <Link href="/sign-in" className="underline decoration-white/20 underline-offset-4 hover:text-neutral-200">
              Sign in
            </Link>
          </div>

          {/* Built-for strip (quick trust) */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-[11px] text-neutral-400">
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 backdrop-blur">
              Fleet maintenance
            </span>
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 backdrop-blur">
              Heavy-duty bays
            </span>
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 backdrop-blur">
              Mixed shops
            </span>
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 backdrop-blur">
              Multi-location
            </span>
          </div>

          {/* Mini feature strip (keep, but align to your real pitch) */}
          <div className="mt-8 grid w-full gap-3 text-[11px] text-neutral-400 sm:grid-cols-3">
            <div className="flex items-center justify-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COPPER }} />
              Seamless onboarding from uploads
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COPPER }} />
              Voice + corner grids for tech speed
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COPPER }} />
              Quotes, approvals, portal, invoices
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}