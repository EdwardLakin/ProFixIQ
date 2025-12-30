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
        {/* subtle inner border glow */}
        <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/5" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Brand heading */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-neutral-400">
              AI–Native Shop & Fleet OS
            </p>

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
              Inspections • Work Orders • AI • Shop & Fleet Portals
            </p>
          </div>

          {/* Main line */}
          <h2 className="mt-6 text-xl font-semibold text-neutral-50 sm:text-2xl md:text-3xl">
            Upload your shop. Get answers in minutes.
          </h2>

          {/* Subcopy */}
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-300 sm:text-base">
            ProFixIQ ingests your customers, vehicles, repair history and parts,
            then uses AI to surface your most common jobs, build smart menus,
            and expose instant insights for both bay floor and fleet. One
            system, tuned to your real-world work on day one.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {/* Primary: scroll to Shop Boost section */}
            <Link
              href="#shop-boost"
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
              Start Shop Boost Setup
            </Link>

            {/* Secondary: AI planner for onboarding */}
            <Link
              href="/agent/planner"
              className="
                rounded-full border border-white/12 bg-black/50
                px-5 py-2.5 text-sm font-semibold text-neutral-100
                backdrop-blur-lg transition
                hover:bg-black/70
              "
            >
              Ask AI about your setup
            </Link>

            {/* Tertiary: fleet portal preview */}
            <Link
              href="/portal/fleet"
              className="
                rounded-full border border-white/12 bg-black/40
                px-5 py-2.5 text-sm font-semibold text-neutral-100
                backdrop-blur-lg transition
                hover:bg-black/70
              "
            >
              Preview fleet portal
            </Link>
          </div>

          {/* Social proof / reassurance line */}
          <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
            Built for heavy-duty, mixed fleets, and busy general repair shops.
          </p>

          {/* Mini feature strip */}
          <div className="mt-8 grid w-full gap-3 text-[11px] text-neutral-400 sm:grid-cols-3">
            <div className="flex items-center justify-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              AI Shop Boost: instant health report &amp; top repairs
            </div>
            <div className="flex items-center justify-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              Auto-built menus, inspections &amp; pricing from your history
            </div>
            <div className="flex items-center justify-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              Customer &amp; fleet portal with live status &amp; approvals
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}