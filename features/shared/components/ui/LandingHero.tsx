"use client";

import Link from "next/link";

const COPPER = "var(--pfq-copper)";
const COPPER_LIGHT = "var(--accent-copper-light)";

type RailStep = {
  key: string;
  label: string;
  hint: string;
};

const RAIL: RailStep[] = [
  { key: "inspect", label: "Inspect", hint: "Evidence + measurements" },
  { key: "quote", label: "Quote", hint: "Lines built automatically" },
  { key: "approve", label: "Approve", hint: "Fleet/customer portals" },
  { key: "parts", label: "Parts", hint: "Requests → receiving" },
  { key: "invoice", label: "Invoice", hint: "Clean billing trail" },
  { key: "portal", label: "Portal", hint: "Live status + history" },
];

function SignalDot() {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{
        background: COPPER,
        boxShadow: "0 0 18px rgba(197,122,74,0.55)",
      }}
      aria-hidden
    />
  );
}

export default function LandingHero() {
  return (
    <section className="relative overflow-x-hidden">
      <style jsx>{`
        /* Copper “signal sweep” across the rail line */
        @keyframes pfqSweep {
          0% {
            transform: translateX(-30%);
            opacity: 0;
          }
          12% {
            opacity: 0.65;
          }
          50% {
            opacity: 0.95;
          }
          88% {
            opacity: 0.65;
          }
          100% {
            transform: translateX(130%);
            opacity: 0;
          }
        }

        /* Active-node hop across 6 steps (discrete, not sliding) */
        @keyframes pfqHop6 {
          0% {
            transform: translateX(0%);
          }
          16.66% {
            transform: translateX(0%);
          }
          16.67% {
            transform: translateX(100%);
          }
          33.33% {
            transform: translateX(100%);
          }
          33.34% {
            transform: translateX(200%);
          }
          50% {
            transform: translateX(200%);
          }
          50.01% {
            transform: translateX(300%);
          }
          66.66% {
            transform: translateX(300%);
          }
          66.67% {
            transform: translateX(400%);
          }
          83.33% {
            transform: translateX(400%);
          }
          83.34% {
            transform: translateX(500%);
          }
          100% {
            transform: translateX(500%);
          }
        }

        /* Subtle “breathing” glow on the active dot */
        @keyframes pfqBreathe {
          0% {
            transform: scale(1);
            opacity: 0.95;
          }
          50% {
            transform: scale(1.08);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0.95;
          }
        }
      `}</style>

      {/* Full-bleed hero area */}
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-10 pt-14 sm:pt-16 md:pt-20">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          {/* LEFT: editorial / outcome */}
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-neutral-300">
              <SignalDot />
              <span style={{ color: COPPER_LIGHT }}>
                Heavy-Duty &amp; Fleet Software
              </span>
              <span className="text-white/10">•</span>
              <span className="text-neutral-400">Built like an operating system</span>
            </div>

            <h1
              className="mt-4 text-4xl leading-[1.03] text-white sm:text-6xl md:text-7xl"
              style={{
                fontFamily: "var(--font-blackops)",
                textShadow: "0 0 46px rgba(0,0,0,0.85)",
              }}
            >
              Run your shop like a{" "}
              <span
                style={{
                  color: COPPER_LIGHT,
                  textShadow: "0 0 26px rgba(197,122,74,0.45)",
                }}
              >
                fleet operation
              </span>
              .
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-neutral-200 sm:text-base md:text-lg">
              Inspections, quotes, parts, approvals, portals, invoicing, and AI — one workflow
              that reduces screen time, speeds approvals, and builds a defensible evidence trail.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/demo/instant-shop-analysis"
                className="rounded-xl px-5 py-3 text-sm font-extrabold text-black transition hover:brightness-110 active:scale-[0.99]"
                style={{
                  background:
                    "linear-gradient(to right, var(--accent-copper-soft), var(--accent-copper))",
                  border: "1px solid rgba(255,255,255,0.10)",
                  boxShadow: "0 0 34px rgba(197,122,74,0.26)",
                }}
              >
                Run Instant Shop Analysis
              </Link>

              <Link
                href="#features"
                className="rounded-xl border border-white/10 bg-black/20 px-5 py-3 text-sm font-semibold text-neutral-100 transition hover:bg-black/30"
              >
                See what’s included
              </Link>
            </div>

            {/* Proof bullets */}
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                <SignalDot />
                <div>
                  <div className="text-sm font-extrabold text-white">Less screen time</div>
                  <div className="mt-0.5 text-xs text-neutral-300">
                    Voice + automation keep techs working.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                <SignalDot />
                <div>
                  <div className="text-sm font-extrabold text-white">Faster approvals</div>
                  <div className="mt-0.5 text-xs text-neutral-300">
                    Portals + evidence streamline decisions.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                <SignalDot />
                <div>
                  <div className="text-sm font-extrabold text-white">Clean evidence trail</div>
                  <div className="mt-0.5 text-xs text-neutral-300">
                    From inspection to invoice, attached.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: “system snapshot” block */}
          <div className="relative">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                    System Snapshot
                  </div>
                  <div className="mt-1 text-lg font-extrabold text-white">
                    One workflow, end-to-end
                  </div>
                </div>

                <div
                  className="rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em]"
                  style={{
                    borderColor: "rgba(255,255,255,0.14)",
                    backgroundColor: "rgba(197,122,74,0.10)",
                    color: COPPER_LIGHT,
                  }}
                >
                  Live ops feel
                </div>
              </div>

              <p className="mt-3 text-sm text-neutral-300">
                ProFixIQ ties together inspections, quotes, parts, approvals, and portals — so
                fleets and customers see the same truth your bay sees.
              </p>

              {/* Workflow rail (ANIMATED) */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-[11px] text-neutral-400">
                  <span className="font-semibold uppercase tracking-[0.18em]">
                    Workflow rail
                  </span>
                  <span className="text-neutral-500">Inspect → Portal</span>
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-4">
                  <div className="relative">
                    {/* base steel line */}
                    <div className="absolute left-2 right-2 top-[13px] h-px bg-white/10" />

                    {/* copper sweep line */}
                    <div className="pointer-events-none absolute left-2 right-2 top-[12px] h-[3px] overflow-hidden">
                      <div
                        className="h-full w-[30%] rounded-full"
                        style={{
                          background:
                            "linear-gradient(90deg, rgba(197,122,74,0) 0%, rgba(197,122,74,0.95) 45%, rgba(197,122,74,0) 100%)",
                          filter: "drop-shadow(0 0 18px rgba(197,122,74,0.55))",
                          animation: "pfqSweep 6s linear infinite",
                        }}
                      />
                    </div>

                    {/* active node glow hops across the 6 nodes */}
                    <div className="pointer-events-none absolute left-0 right-0 top-[2px]">
                      <div
                        className="grid grid-cols-6 gap-2"
                        style={{ animation: "pfqHop6 6s steps(1) infinite" }}
                      >
                        {/* Only the first col renders content; animation shifts this container */}
                        <div className="col-span-1 flex justify-center">
                          <div
                            className="mt-[2px] flex h-7 w-7 items-center justify-center rounded-full"
                            style={{
                              boxShadow: "0 0 0 1px rgba(197,122,74,0.25) inset, 0 0 26px rgba(197,122,74,0.22)",
                            }}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: "rgba(197,122,74,0.98)",
                                boxShadow: "0 0 22px rgba(197,122,74,0.60)",
                                animation: "pfqBreathe 1.2s ease-in-out infinite",
                              }}
                            />
                          </div>
                        </div>
                        {/* empty placeholders so the grid keeps 6 columns */}
                        <div />
                        <div />
                        <div />
                        <div />
                        <div />
                      </div>
                    </div>

                    {/* rail nodes */}
                    <div className="grid grid-cols-6 gap-2">
                      {RAIL.map((s) => (
                        <div key={s.key} className="text-center">
                          <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/40">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: "rgba(197,122,74,0.45)",
                                boxShadow: "0 0 10px rgba(197,122,74,0.14)",
                              }}
                            />
                          </div>
                          <div className="mt-2 text-[11px] font-extrabold text-white">
                            {s.label}
                          </div>
                          <div className="mt-1 text-[10px] leading-snug text-neutral-400">
                            {s.hint}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Included highlights */}
              <div className="mt-5 grid gap-2">
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/15 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
                    <SignalDot />
                    Seamless onboarding from uploads
                  </div>
                  <span className="text-[11px] text-neutral-400">Day-one ready</span>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/15 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
                    <SignalDot />
                    Voice + corner grids for tech speed
                  </div>
                  <span className="text-[11px] text-neutral-400">Less typing</span>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/15 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
                    <SignalDot />
                    Quotes, approvals, portal, invoices
                  </div>
                  <span className="text-[11px] text-neutral-400">One truth</span>
                </div>
              </div>

              {/* Tiny portal links (still accessible) */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-neutral-400">
                <div className="flex items-center gap-2">
                  <span className="font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    Entry
                  </span>
                  <span className="text-white/10">•</span>
                  <Link
                    href="/portal"
                    className="underline decoration-white/20 underline-offset-4 hover:text-neutral-200"
                  >
                    Customer portal
                  </Link>
                  <span className="text-white/10">•</span>
                  <Link
                    href="/portal/fleet"
                    className="underline decoration-white/20 underline-offset-4 hover:text-neutral-200"
                  >
                    Fleet portal
                  </Link>
                </div>

                <Link
                  href="/sign-in"
                  className="underline decoration-white/20 underline-offset-4 hover:text-neutral-200"
                >
                  Sign in
                </Link>
              </div>
            </div>

            {/* copper signal wash */}
            <div
              className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl"
              style={{ background: "rgba(197,122,74,0.16)" }}
            />
          </div>
        </div>
      </div>

      {/* thin rail divider into next section */}
      <div className="mx-auto max-w-[1400px] px-4 pb-2">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
    </section>
  );
}