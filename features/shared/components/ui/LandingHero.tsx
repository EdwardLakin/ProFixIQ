// features/shared/components/ui/LandingHero.tsx
"use client";

import Link from "next/link";

export default function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-black text-white">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/80 to-black" />

        {/* Copper glow */}
        <div
          className="absolute -top-36 left-1/2 h-[680px] w-[680px] -translate-x-1/2 rounded-full blur-3xl opacity-40"
          style={{ background: "rgba(193, 102, 59, 0.35)" }}
        />
        <div
          className="absolute -bottom-64 right-[-200px] h-[720px] w-[720px] rounded-full blur-3xl opacity-25"
          style={{ background: "rgba(126, 64, 35, 0.35)" }}
        />
        <div
          className="absolute -bottom-64 left-[-220px] h-[720px] w-[720px] rounded-full blur-3xl opacity-20"
          style={{ background: "rgba(227, 154, 110, 0.18)" }}
        />

        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.14) 1px, transparent 1px)",
            backgroundSize: "84px 84px",
          }}
        />
      </div>

      {/* Ghost HD / FLEET backdrop */}
      <div className="pointer-events-none absolute inset-x-0 top-10 flex justify-center">
        <div className="relative mx-auto w-full max-w-5xl">
          <span
            className={[
              "block text-center font-blackops leading-none",
              "text-[110px] sm:text-[170px] md:text-[210px]",
              "tracking-[0.5em]",
            ].join(" ")}
            style={{
              color: "rgba(255,255,255,0.04)",
              textShadow: "0 0 60px rgba(0,0,0,0.9)",
            }}
          >
            HD · FLEET
          </span>
        </div>
      </div>

      {/* Side rail labels for HD / FLEET (desktop only) */}
      <div className="pointer-events-none hidden md:block">
        <span
          className="absolute left-6 top-1/2 -translate-y-1/2 -rotate-90 text-[11px] tracking-[0.28em] uppercase text-white/25"
          style={{ letterSpacing: "0.28em" }}
        >
          Heavy Duty
        </span>
        <span
          className="absolute right-6 top-1/2 -translate-y-1/2 rotate-90 text-[11px] tracking-[0.28em] uppercase text-white/25"
          style={{ letterSpacing: "0.28em" }}
        >
          Fleet
        </span>
      </div>

      {/* Foreground content */}
      <div className="relative mx-auto max-w-7xl px-6 pt-24 pb-16 text-center">
        <p className="text-xs tracking-[0.22em] text-neutral-400 uppercase">
          Repair smarter • Diagnose faster • Document cleaner
        </p>

        <h1
          className={[
            "mt-5",
            "font-blackops",
            "text-[44px] leading-tight sm:text-[72px] md:text-[96px] lg:text-[112px]",
            "drop-shadow-[0_0_40px_rgba(193,102,59,0.20)]",
          ].join(" ")}
          style={{
            backgroundImage:
              "linear-gradient(180deg, var(--accent-copper-light), var(--accent-copper))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          ProFixIQ
        </h1>

        <p className="mx-auto mt-5 max-w-3xl text-base sm:text-lg text-neutral-300 leading-relaxed">
          From inspections to invoices — ProFixIQ keeps your shop moving.
          Automate the busywork, capture proof fast, and turn findings into
          clean work orders and customer-ready approvals. Built for general
          repair and heavy-duty / fleet programs so every unit has a clear
          health record.
        </p>

        {/* Trust strip */}
        <div className="mx-auto mt-8 max-w-4xl rounded-2xl border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-xl">
          <div className="grid gap-2 text-left text-xs text-neutral-300 sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: "var(--accent-copper)" }}
              />
              AI Planner + live updates
            </div>
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: "var(--accent-copper)" }}
              />
              HD inspections, corner grids &amp; pre-trips
            </div>
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: "var(--accent-copper)" }}
              />
              Team chat, customer + fleet portal dispatch
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/sign-in?redirectedFrom=/ai"
            className="rounded-xl px-5 py-3 font-semibold text-black shadow-lg transition hover:opacity-95"
            style={{ backgroundColor: "var(--accent-copper)" }}
          >
            Try the AI
          </Link>

          <a
            href="#features"
            className="rounded-xl border border-white/15 bg-black/25 px-5 py-3 font-semibold text-white transition hover:bg-neutral-900/40"
          >
            Explore Features
          </a>

          <a
            href="#plans"
            className="rounded-xl border border-white/15 bg-black/25 px-5 py-3 font-semibold text-white transition hover:bg-neutral-900/40"
          >
            Pricing
          </a>
        </div>

        {/* Mini “preview” band (no images required) */}
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Inspection → Quote",
              desc: "Turn findings into line items, fast. Evidence stays attached to the job.",
            },
            {
              title: "AI Planner & HD Programs",
              desc: "Describe the goal. The AI suggests inspections and work for cars, trucks, and fleets.",
            },
            {
              title: "Customer & Fleet Portal",
              desc: "History, booking, unit management, and approvals — clean and simple for retail or fleet.",
            },
          ].map((b) => (
            <div
              key={b.title}
              className="rounded-2xl border border-white/10 bg-black/30 p-4 text-left backdrop-blur-xl"
            >
              <div className="text-sm font-semibold text-white">{b.title}</div>
              <div className="mt-1 text-xs text-neutral-400">{b.desc}</div>
              <div
                className="mt-3 h-1 w-10 rounded-full"
                style={{ backgroundColor: "var(--accent-copper)" }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}