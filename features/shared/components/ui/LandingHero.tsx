// features/shared/components/ui/LandingHero.tsx
"use client";

import Link from "next/link";

const COPPER = "#C57A4A";

export default function LandingHero() {
  return (
    <section
      className={`
        relative overflow-hidden
        bg-background text-white
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.12),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_82%)]
      `}
    >
      {/* Subtle HD / FLEET typography in the background */}
      <div className="pointer-events-none absolute inset-0">
        {/* Faint grid */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(148,163,184,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.18) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
        {/* Large ghost “HD” left */}
        <span
          aria-hidden
          className="absolute left-[-12px] top-16 hidden text-[160px] font-blackops text-white/3 md:block"
        >
          HD
        </span>
        {/* Large ghost “FLEET” right, vertical */}
        <span
          aria-hidden
          className="absolute right-[-62px] bottom-10 hidden rotate-90 text-[150px] font-blackops text-white/3 lg:block"
        >
          FLEET
        </span>
      </div>

      <div className="relative mx-auto flex min-h-[70vh] max-w-5xl items-center px-4 py-16 sm:px-6 lg:px-8">
        {/* Main glass hero card – echoes portal sign-in */}
        <div
          className={`
            w-full rounded-[32px] border
            border-[color:var(--metal-border-soft,#1f2937)]
            bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.22),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_90%)]
            px-6 py-7 sm:px-10 sm:py-10
            shadow-[0_42px_110px_rgba(0,0,0,0.95)]
          `}
        >
          {/* Top badge + tiny nav */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div
              className="
                inline-flex items-center gap-2 rounded-full border
                border-[color:var(--metal-border-soft,#1f2937)]
                bg-black/70
                px-3 py-1 text-[10px]
                uppercase tracking-[0.22em]
                text-neutral-300
              "
            >
              <span style={{ color: COPPER }}>ProFixIQ</span>
              <span className="text-neutral-500">• Portal & AI</span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-neutral-400">
              <span className="hidden sm:inline text-neutral-500">
                For shops & fleets
              </span>
              <span className="h-1 w-1 rounded-full bg-neutral-600" />
              <span className="text-neutral-400">Inspections · Work Orders · Portal</span>
            </div>
          </div>

          {/* Main heading */}
          <div className="space-y-4">
            <h1
              className="
                text-4xl sm:text-5xl lg:text-6xl
                font-blackops
                leading-tight
              "
              style={{
                backgroundImage:
                  "linear-gradient(to bottom, var(--accent-copper-light), var(--accent-copper))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              From bay floor to fleet portal.
            </h1>

            <p className="max-w-2xl text-sm sm:text-base text-neutral-300 leading-relaxed">
              ProFixIQ keeps heavy-duty and general repair work flowing —
              inspections, corner grids, AI suggestions, work orders, and
              customer / fleet approvals all share the same record, instead of
              living in five different tools.
            </p>
          </div>

          {/* CTA row */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/sign-in?redirectedFrom=/ai"
              className="
                inline-flex items-center justify-center rounded-full
                bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))]
                px-5 py-2.5 text-sm font-semibold
                uppercase tracking-[0.22em] text-black
                shadow-[0_0_26px_rgba(212,118,49,0.9)]
                hover:brightness-110
              "
            >
              Try the AI
            </Link>

            <Link
              href="/portal/auth/sign-in"
              className="
                inline-flex items-center justify-center rounded-full
                border border-white/18 bg-black/40
                px-4 py-2 text-xs sm:text-sm font-semibold
                text-neutral-100 hover:bg-black/70
              "
            >
              Customer portal
            </Link>

            <Link
              href="/portal/fleet"
              className="
                inline-flex items-center justify-center rounded-full
                border border-white/18 bg-black/30
                px-4 py-2 text-xs sm:text-sm font-semibold
                text-neutral-100 hover:bg-black/60
              "
            >
              Fleet portal
            </Link>
          </div>

          {/* Mini trust strip – matches sign-in footnotes */}
          <div className="mt-8 grid gap-3 text-[11px] text-neutral-400 sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              AI planner for jobs, inspections & estimates.
            </div>
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              HD inspections, corner grids & pre-trips.
            </div>
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              Customer & fleet portal with live status.
            </div>
          </div>

          {/* Bottom: 3 mini feature cards to echo your portal layout */}
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              {
                title: "Inspection → Quote",
                desc: "Capture findings once, turn them into line items with photos and voice notes attached.",
              },
              {
                title: "AI Planner & HD Programs",
                desc: "Describe the job. The AI suggests inspections and work for cars, trucks, and fleets.",
              },
              {
                title: "Customer & Fleet Portal",
                desc: "History, booking, unit management, and approvals — clean and simple for retail or fleet.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="
                  rounded-2xl border border-white/10
                  bg-black/35 p-4 text-left
                  backdrop-blur-xl
                "
              >
                <div className="text-xs font-semibold text-neutral-50">
                  {card.title}
                </div>
                <div className="mt-2 text-[11px] text-neutral-400">
                  {card.desc}
                </div>
                <div
                  className="mt-3 h-[3px] w-10 rounded-full"
                  style={{ backgroundColor: COPPER }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}