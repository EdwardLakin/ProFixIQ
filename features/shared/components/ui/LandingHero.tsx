// features/shared/components/ui/LandingHero.tsx
"use client";

import Link from "next/link";
import Container from "@shared/components/ui/Container";

const COPPER = "var(--pfq-copper)";

export default function LandingHero() {
  return (
    <section className="relative overflow-hidden py-16 md:py-20">
      <Container>
        {/* Glass hero panel */}
        <div
          className="
            mx-auto max-w-5xl rounded-[32px]
            border border-white/12
            bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.16),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_85%)]
            px-6 py-10 md:px-10 md:py-14
            shadow-[0_32px_80px_rgba(0,0,0,0.9)]
            backdrop-blur-2xl
          "
        >
          {/* Label */}
          <div className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
            Inspections • Work Orders • AI • Portal
          </div>

          {/* Brand + headline */}
          <div className="mt-4 text-center">
            <h1
              className="text-4xl md:text-5xl lg:text-6xl"
              style={{
                fontFamily: "var(--font-blackops)",
                color: COPPER,
              }}
            >
              ProFixIQ
            </h1>
            <p className="mt-3 text-lg md:text-xl text-neutral-100">
              From bay floor to fleet portal.
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-sm md:text-base text-neutral-300">
              Keep heavy-duty and general repair work flowing — inspections,
              corner grids, AI suggestions, work orders, and portal approvals
              all share the same clean record.
            </p>
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 md:flex-row">
            <Link
              href="/agent/planner"
              className="
                inline-flex items-center justify-center
                rounded-full px-6 py-2.5 text-sm font-semibold text-black
                shadow-[0_0_30px_rgba(212,118,49,0.85)]
                transition hover:brightness-110
              "
              style={{
                background:
                  "linear-gradient(to right,var(--pfq-copper-soft),var(--pfq-copper))",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              Try the AI
            </Link>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link
                href="/portal"
                className="
                  inline-flex items-center justify-center
                  rounded-full border border-white/14
                  bg-black/50 px-4 py-2 text-sm font-semibold text-neutral-100
                  backdrop-blur-xl transition hover:bg-neutral-900/60
                "
              >
                Customer portal
              </Link>
              <Link
                href="/portal/fleet"
                className="
                  inline-flex items-center justify-center
                  rounded-full border border-white/14
                  bg-black/50 px-4 py-2 text-sm font-semibold text-neutral-100
                  backdrop-blur-xl transition hover:bg-neutral-900/60
                "
              >
                Fleet portal
              </Link>
            </div>
          </div>

          {/* Mini feature blurbs */}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 text-[11px] text-neutral-400 md:flex-row">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              <span>AI planner for jobs, inspections &amp; estimates.</span>
            </div>
            <div className="hidden h-px w-8 bg-white/10 md:block" />
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              <span>HD inspections, corner grids &amp; pre-trips.</span>
            </div>
            <div className="hidden h-px w-8 bg-white/10 md:block" />
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