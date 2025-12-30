// @shared/components/ui/LandingHero.tsx
"use client";

import Link from "next/link";
import Container from "@shared/components/ui/Container";

const COPPER = "var(--pfq-copper)";

export default function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ghost HD / FLEET rails */}
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center">
        <span
          className="
            select-none text-[9rem] md:text-[11rem] lg:text-[13rem]
            font-blackops uppercase tracking-[0.3em]
            text-white/5 md:text-white/7
            translate-x-[-30%]
          "
          aria-hidden
        >
          HD
        </span>
      </div>

      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end">
        <span
          className="
            select-none text-[6.5rem] md:text-[8rem] lg:text-[9rem]
            font-blackops uppercase tracking-[0.25em]
            text-white/4 md:text-white/6
            translate-x-[18%]
          "
          aria-hidden
        >
          FLEET
        </span>
      </div>

      <Container className="relative z-10 py-10 md:py-16 lg:py-20">
        <div
          className="
            mx-auto max-w-5xl
            rounded-[2.25rem]
            border border-[color:var(--metal-border-soft,#1f2937)]
            bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.97),#020617_82%)]
            px-5 py-7 sm:px-8 sm:py-9
            shadow-[0_34px_90px_rgba(0,0,0,0.95)]
          "
        >
          {/* Top row: chip + small meta */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="inline-flex items-center gap-2">
              <span
                className="
                  inline-flex items-center gap-2 rounded-full border
                  border-[color:var(--metal-border-soft,#1f2937)]
                  bg-black/70 px-3 py-1 text-[10px]
                  uppercase tracking-[0.26em] text-neutral-300
                "
                style={{ color: COPPER }}
              >
                ProFixIQ • Portal &amp; AI
              </span>
            </div>

            <div className="text-[11px] text-neutral-400">
              For shops &amp; fleets • Inspections • Work Orders • Portal
            </div>
          </div>

          {/* Brand + headline */}
          <div className="mt-6 space-y-3">
            <h1
              className="text-4xl sm:text-5xl lg:text-[3.4rem] leading-tight text-neutral-50"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              ProFixIQ
            </h1>
            <h2 className="text-xl sm:text-2xl text-neutral-100">
              From bay floor to fleet portal.
            </h2>
            <p className="max-w-2xl text-sm sm:text-[0.9rem] text-neutral-300">
              Keep heavy-duty and general repair work flowing — inspections,
              corner grids, AI suggestions, work orders, and customer or fleet
              approvals all share the same clean record.
            </p>
          </div>

          {/* CTAs */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/agent/planner"
              className="
                inline-flex items-center justify-center rounded-full
                bg-[linear-gradient(to_right,var(--pfq-copper-soft),var(--pfq-copper))]
                px-5 py-2.5 text-xs sm:text-sm font-semibold uppercase tracking-[0.22em]
                text-black shadow-[0_0_26px_rgba(212,118,49,0.9)]
                hover:brightness-110
              "
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              Try the AI
            </Link>

            <Link
              href="/portal/auth/sign-in"
              className="
                inline-flex items-center justify-center rounded-full
                border border-white/14 bg-black/50 px-4 py-2 text-xs sm:text-sm
                font-semibold text-neutral-100 hover:bg-black/70
              "
            >
              Customer portal
            </Link>

            <Link
              href="/portal/fleet"
              className="
                inline-flex items-center justify-center rounded-full
                border border-white/14 bg-black/40 px-4 py-2 text-xs sm:text-sm
                font-semibold text-neutral-100 hover:bg-black/65
              "
            >
              Fleet portal
            </Link>
          </div>

          {/* Mini feature strip */}
          <div className="mt-7 grid gap-3 text-[11px] text-neutral-400 sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              <span>AI planner for jobs, inspections &amp; estimates.</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              <span>HD inspections, corner grids &amp; pre-trips.</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              <span>Customer &amp; fleet portal with live status.</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}