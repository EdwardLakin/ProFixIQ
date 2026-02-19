// features/shared/components/ui/LandingShopBoost.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

const COPPER = "var(--pfq-copper)";
const COPPER_LIGHT = "var(--accent-copper-light)";

type Chip = {
  label: string;
  sub?: string;
};

const INCLUDED_MODULES: Chip[] = [
  { label: "AI voice & dictation" },
  { label: "Fleet portal & pre-trips" },
  { label: "Parts & inventory" },
  { label: "Accounting & payments" },
  { label: "AI smart suggestions" },
];

function SignalDot() {
  return (
    <span
      className="relative z-10 inline-block h-2 w-2 rounded-full"
      style={{
        background: "rgba(197,122,74,0.95)",
        boxShadow: "0 0 18px rgba(197,122,74,0.55)",
      }}
      aria-hidden
    />
  );
}

export default function LandingShopBoost() {
  const chips = useMemo(() => INCLUDED_MODULES, []);
  const [activeIdx, setActiveIdx] = useState(0);

  // Capabilities rail animation: step highlight hops across chips
  useEffect(() => {
    if (chips.length <= 1) return;
    const t = window.setInterval(() => {
      setActiveIdx((i) => (i + 1) % chips.length);
    }, 1100);
    return () => window.clearInterval(t);
  }, [chips.length]);

  return (
    <section className="relative mx-auto mt-8 max-w-[1400px] px-4 pb-20 sm:pb-28">
      <style jsx>{`
        @keyframes pfqCapSweep {
          0% {
            transform: translateX(-35%);
            opacity: 0;
          }
          12% {
            opacity: 0.55;
          }
          50% {
            opacity: 0.95;
          }
          88% {
            opacity: 0.55;
          }
          100% {
            transform: translateX(135%);
            opacity: 0;
          }
        }

        @keyframes pfqBreathe {
          0% {
            transform: scale(1);
            opacity: 0.92;
          }
          50% {
            transform: scale(1.08);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0.92;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .pfq-cap-sweep {
            animation: none !important;
            opacity: 0 !important;
          }
          .pfq-breathe {
            animation: none !important;
          }
        }
      `}</style>

      {/* steel divider */}
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Header line */}
      <div className="pt-10">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-neutral-300">
          <SignalDot />
          <span style={{ color: COPPER_LIGHT }}>Shop Boost Setup</span>
          <span className="text-white/10">•</span>
          <span className="text-neutral-400">Day-one ready</span>
        </div>

        <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
          From blank system to shop-ready in{" "}
          <span style={{ color: COPPER_LIGHT }}>three steps</span>.
        </h2>

        <p className="mt-4 max-w-4xl text-sm leading-relaxed text-neutral-300 sm:text-base">
          Don’t spend weeks configuring software. ProFixIQ reads how your shop
          already works and builds around it — inspections, menus, automation,
          and portals that match fleet reality.
        </p>
      </div>

      {/* TOP ROW: 3 step cards (matches your preferred screenshot layout) */}
      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {/* Step 1 */}
        <div className="rounded-2xl border border-white/10 bg-black/15 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold"
                style={{
                  backgroundColor: "rgba(197,122,74,0.14)",
                  color: COPPER_LIGHT,
                  border: "1px solid rgba(197,122,74,0.35)",
                  boxShadow: "0 0 18px rgba(197,122,74,0.10)",
                }}
              >
                01
              </span>

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                  Profile
                </div>
                <div className="mt-0.5 text-base font-extrabold text-white">
                  Answer 5–10 quick questions.
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-400">
              <SignalDot />
              Tailored
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-neutral-300">
            Tell us what you run (fleet, mixed, diesel, automotive), how many
            bays/techs, and what data you have. We tailor the system to your
            workflow — not generic templates.
          </p>
        </div>

        {/* Step 2 */}
        <div className="rounded-2xl border border-white/10 bg-black/15 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold"
                style={{
                  backgroundColor: "rgba(197,122,74,0.14)",
                  color: COPPER_LIGHT,
                  border: "1px solid rgba(197,122,74,0.35)",
                  boxShadow: "0 0 18px rgba(197,122,74,0.10)",
                }}
              >
                02
              </span>

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                  Upload
                </div>
                <div className="mt-0.5 text-base font-extrabold text-white">
                  Drag in customers, units, parts, history.
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-400">
              <SignalDot />
              Import-ready
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-neutral-300">
            Import CSVs or exports from your old system. ProFixIQ normalizes
            customers, vehicles, repair orders, and inventory into one clean
            record — ready for inspections and work orders.
          </p>
        </div>

        {/* Step 3 */}
        <div className="rounded-2xl border border-white/10 bg-black/15 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold"
                style={{
                  backgroundColor: "rgba(197,122,74,0.14)",
                  color: COPPER_LIGHT,
                  border: "1px solid rgba(197,122,74,0.35)",
                  boxShadow: "0 0 18px rgba(197,122,74,0.10)",
                }}
              >
                03
              </span>

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                  Blueprint
                </div>
                <div className="mt-0.5 text-base font-extrabold text-white">
                  AI builds your shop operating plan.
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-400">
              <SignalDot />
              Shop-ready
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-neutral-300">
            ProFixIQ surfaces your top repairs, pre-builds starter menus and
            inspections, and highlights missed packages — so you can start
            writing smarter work orders on day one.
          </p>
        </div>
      </div>

      {/* BOTTOM ROW: 2 wide cards */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Owner snapshot */}
        <div className="rounded-2xl border border-white/10 bg-black/15 p-6 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                What you get immediately
              </div>
              <div className="mt-1 text-xl font-extrabold text-white">
                Instant owner snapshot (the “holy sh*t” moment).
              </div>
            </div>

            <span
              className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em]"
              style={{
                borderColor: "rgba(255,255,255,0.14)",
                backgroundColor: "rgba(197,122,74,0.10)",
                color: COPPER_LIGHT,
              }}
            >
              Included
            </span>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-neutral-300">
            As soon as imports finish, you get a Shop Health Snapshot: top
            repairs, comeback risks, average RO, and fleet downtime signals —
            less like “new software”, more like a diagnostic scan for your
            business.
          </p>
        </div>

        {/* Included capabilities rail */}
        <div className="rounded-2xl border border-white/10 bg-black/15 p-6 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                Included capabilities (day one)
              </div>
              <div className="mt-2 text-sm font-semibold text-neutral-200">
                Everything is accessible from day one — roll it out at your pace
                (training + adoption), not with add-on pricing.
              </div>
            </div>

            <span className="shrink-0 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-neutral-200">
              No extra cost
            </span>
          </div>

          {/* Rail container */}
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
            <div className="relative">
              {/* steel base line */}
              <div className="absolute left-3 right-3 top-[18px] h-px bg-white/10" />

              {/* copper sweep */}
              <div className="pfq-cap-sweep pointer-events-none absolute left-3 right-3 top-[17px] h-[3px] overflow-hidden">
                <div
                  className="h-full w-[28%] rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(197,122,74,0) 0%, rgba(197,122,74,0.95) 45%, rgba(197,122,74,0) 100%)",
                    filter: "drop-shadow(0 0 18px rgba(197,122,74,0.55))",
                    animation: "pfqCapSweep 5.5s linear infinite",
                  }}
                />
              </div>

              {/* chips */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {chips.map((c, idx) => {
                  const active = idx === activeIdx;
                  return (
                    <span
                      key={c.label}
                      className="rounded-full border px-3 py-2 text-center text-[12px] font-semibold"
                      style={{
                        borderColor: active
                          ? "rgba(197,122,74,0.55)"
                          : "rgba(255,255,255,0.12)",
                        backgroundColor: active
                          ? "rgba(197,122,74,0.10)"
                          : "rgba(0,0,0,0.30)",
                        color: active ? "rgba(255,255,255,0.92)" : "rgba(226,232,240,0.88)",
                        boxShadow: active
                          ? "0 0 26px rgba(197,122,74,0.22), 0 0 0 1px rgba(197,122,74,0.14) inset"
                          : "0 0 22px rgba(15,23,42,0.55)",
                        transform: active ? "translateY(-1px)" : "none",
                      }}
                    >
                      <span
                        className={active ? "pfq-breathe inline-flex items-center gap-2" : "inline-flex items-center gap-2"}
                        style={{
                          animation: active ? "pfqBreathe 1.15s ease-in-out infinite" : undefined,
                        }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: active ? "rgba(197,122,74,0.95)" : "rgba(148,163,184,0.45)",
                            boxShadow: active ? "0 0 18px rgba(197,122,74,0.55)" : "none",
                          }}
                        />
                        {c.label}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 text-xs text-neutral-400">
              Nothing is paywalled. Rollout is about adoption — not upgrading.
            </div>
          </div>

          {/* small promise rail */}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COPPER }} />
            Included day one
            <span className="text-white/10">•</span>
            Train + deploy in phases
            <span className="text-white/10">•</span>
            No add-on pricing
          </div>
        </div>
      </div>

      {/* copper + steel wash */}
      <div
        className="pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full blur-3xl"
        style={{ background: "rgba(197,122,74,0.12)" }}
      />
      <div
        className="pointer-events-none absolute -left-24 bottom-10 h-80 w-80 rounded-full blur-3xl"
        style={{ background: "rgba(15,23,42,0.35)" }}
      />

      {/* divider into next section */}
      <div className="mt-10 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </section>
  );
}