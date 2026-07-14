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

      <div className="mx-auto w-full max-w-[1400px] px-4 pb-10 pt-14 sm:pt-16 md:pt-20">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--theme-text-secondary)]">
              <SignalDot />
              <span style={{ color: COPPER_LIGHT }}>
                Heavy-Duty &amp; Fleet Shop OS
              </span>
              <span className="text-[color:var(--theme-text-muted)]">•</span>
              <span className="text-[color:var(--theme-text-secondary)]">
                Built for the floor — not forms
              </span>
            </div>

            <h1
              className="mt-4 text-4xl leading-[1.03] text-[color:var(--theme-text-primary)] sm:text-6xl md:text-7xl"
              style={{
                fontFamily: "var(--font-blackops)",
                boxShadow: "var(--theme-shadow-medium)",
              }}
            >
              <span className="block">The</span>
              <span
                className="block"
                style={{
                  color: COPPER_LIGHT,
                  textShadow: "0 0 30px rgba(197,122,74,0.22)",
                }}
              >
                operating system
              </span>
              <span className="block">for modern repair shops.</span>
            </h1>

            <p className="mt-4 max-w-2xl text-sm font-semibold text-[color:var(--theme-text-primary)] sm:text-base">
              Built for heavy-duty, automotive, and fleet repair operations.
            </p>

            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[color:var(--theme-text-secondary)] sm:text-base md:text-lg">
              Technicians capture evidence once. Quotes build automatically.
              Customers approve instantly. Parts and invoices stay in sync.
            </p>

            <div
              className="mt-5 text-lg font-extrabold uppercase tracking-[0.18em] sm:text-xl md:text-2xl"
              style={{
                color: COPPER_LIGHT,
                textShadow: "0 0 26px rgba(197,122,74,0.35)",
              }}
            >
              Heavy-Duty • Automotive • Fleet
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/demo/instant-shop-analysis"
                className="rounded-xl px-5 py-3 text-sm font-extrabold text-[color:var(--theme-text-on-accent)] transition hover:brightness-110 active:scale-[0.99]"
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
                className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-5 py-3 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-inset)]"
              >
                See what’s included
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="flex items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 backdrop-blur-sm">
                <SignalDot />
                <div>
                  <div className="text-sm font-extrabold text-[color:var(--theme-text-primary)]">
                    Evidence-first inspections
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                    Photos + notes + measurements stay attached.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 backdrop-blur-sm">
                <SignalDot />
                <div>
                  <div className="text-sm font-extrabold text-[color:var(--theme-text-primary)]">
                    Build the job once
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                    Parts + labor flow forward — no re-entry.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 backdrop-blur-sm">
                <SignalDot />
                <div>
                  <div className="text-sm font-extrabold text-[color:var(--theme-text-primary)]">
                    Approvals that move work
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                    Portal decisions trigger the next step.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 backdrop-blur-xl shadow-[var(--theme-shadow-medium)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
                    System Snapshot
                  </div>
                  <div className="mt-1 text-lg font-extrabold text-[color:var(--theme-text-primary)]">
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

              <p className="mt-3 text-sm text-[color:var(--theme-text-secondary)]">
                ProFixIQ ties together inspections, parts, approvals, and portals
                — so fleets and customers see the same truth your bay sees.
              </p>

              <div className="mt-5">
                <div className="flex items-center justify-between text-[11px] text-[color:var(--theme-text-secondary)]">
                  <span className="font-semibold uppercase tracking-[0.18em]">
                    Workflow rail
                  </span>
                  <span className="text-[color:var(--theme-text-muted)]">Inspect → Portal</span>
                </div>

                <div className="mt-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
                  <div className="relative">
                    <div className="absolute left-2 right-2 top-[13px] h-px bg-[color:var(--theme-surface-subtle)]" />

                    <div className="pointer-events-none absolute left-2 right-2 top-[12px] h-[3px] overflow-hidden">
                      <div
                        className="h-full w-[30%] rounded-full"
                        style={{
                          background:
                            "linear-gradient(90deg, rgba(197,122,74,0) 0%, rgba(197,122,74,0.95) 45%, rgba(197,122,74,0) 100%)",
                          filter:
                            "drop-shadow(0 0 18px rgba(197,122,74,0.55))",
                          animation: "pfqSweep 6s linear infinite",
                        }}
                      />
                    </div>

                    <div className="pointer-events-none absolute left-0 right-0 top-[2px]">
                      <div
                        className="grid grid-cols-6 gap-2"
                        style={{
                          animation: "pfqHop6 6s steps(1) infinite",
                        }}
                      >
                        <div className="col-span-1 flex justify-center">
                          <div
                            className="mt-[2px] flex h-7 w-7 items-center justify-center rounded-full"
                            style={{
                              boxShadow:
                                "0 0 0 1px rgba(197,122,74,0.25) inset, 0 0 26px rgba(197,122,74,0.22)",
                            }}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: "rgba(197,122,74,0.98)",
                                boxShadow:
                                  "0 0 22px rgba(197,122,74,0.60)",
                                animation: "pfqBreathe 1.2s ease-in-out infinite",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="relative grid grid-cols-6 gap-2">
                      {RAIL.map((step) => (
                        <div key={step.key} className="flex flex-col items-center text-center">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[11px] font-extrabold text-[color:var(--theme-text-primary)]">
                            {step.label.charAt(0)}
                          </div>
                          <div className="mt-2 text-[11px] font-semibold text-[color:var(--theme-text-primary)]">
                            {step.label}
                          </div>
                          <div className="mt-1 text-[10px] leading-tight text-[color:var(--theme-text-muted)]">
                            {step.hint}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
                    Less screen time
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
                    Techs stay in flow.
                  </div>
                </div>

                <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
                    Faster approvals
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
                    Proof moves decisions.
                  </div>
                </div>

                <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
                    One truth
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
                    Inspection to invoice.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
