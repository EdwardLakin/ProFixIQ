"use client";

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
      className="inline-block h-2 w-2 rounded-full"
      style={{
        background: "rgba(197,122,74,0.95)",
        boxShadow: "0 0 18px rgba(197,122,74,0.55)",
      }}
      aria-hidden
    />
  );
}

export default function LandingShopBoost() {
  const chipCount = INCLUDED_MODULES.length;

  return (
    <section className="relative mx-auto mt-6 max-w-[1400px] px-4 pb-20 sm:pb-28">
      <style jsx>{`
        /* Copper sweep through the capabilities rail */
        @keyframes pfqCapSweep {
          0% {
            transform: translateX(-35%);
            opacity: 0;
          }
          12% {
            opacity: 0.6;
          }
          50% {
            opacity: 0.95;
          }
          88% {
            opacity: 0.6;
          }
          100% {
            transform: translateX(135%);
            opacity: 0;
          }
        }

        /* Hop across 5 chips */
        @keyframes pfqCapHop5 {
          0% {
            transform: translateX(0%);
          }
          20% {
            transform: translateX(0%);
          }
          20.01% {
            transform: translateX(100%);
          }
          40% {
            transform: translateX(100%);
          }
          40.01% {
            transform: translateX(200%);
          }
          60% {
            transform: translateX(200%);
          }
          60.01% {
            transform: translateX(300%);
          }
          80% {
            transform: translateX(300%);
          }
          80.01% {
            transform: translateX(400%);
          }
          100% {
            transform: translateX(400%);
          }
        }

        @keyframes pfqCapBreathe {
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

        /* Respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .pfq-cap-sweep {
            animation: none !important;
            opacity: 0 !important;
          }
          .pfq-cap-hop {
            animation: none !important;
          }
          .pfq-cap-breathe {
            animation: none !important;
          }
        }
      `}</style>

      {/* steel divider */}
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative grid gap-10 pt-10 lg:grid-cols-[1fr_1fr] lg:items-start">
        {/* LEFT: 3 steps */}
        <div className="relative">
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

          <p className="mt-4 max-w-xl text-sm leading-relaxed text-neutral-300 sm:text-base">
            Don’t spend weeks configuring software. ProFixIQ reads how your shop already works and
            builds around it — inspections, menus, automation, and portals that match fleet reality.
          </p>

          <div className="mt-8 grid gap-3">
            {/* Step 1 */}
            <div className="rounded-2xl border border-white/10 bg-black/15 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold"
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
                    <div className="text-base font-extrabold text-white">
                      Answer 5–10 quick questions.
                    </div>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-400">
                  <SignalDot />
                  Tailored setup
                </div>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-neutral-300">
                Tell us what you run (fleet, mixed, diesel, automotive), how many bays/techs, and what
                data you have. We tailor the system to your real workflow — not generic templates.
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-2xl border border-white/10 bg-black/15 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold"
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
                    <div className="text-base font-extrabold text-white">
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
                Import CSVs or exports from your old system. ProFixIQ normalizes customers, vehicles,
                repair orders, and inventory into one clean record — ready for inspections and work
                orders.
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-2xl border border-white/10 bg-black/15 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold"
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
                    <div className="text-base font-extrabold text-white">
                      AI builds your operating plan.
                    </div>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-400">
                  <SignalDot />
                  Shop-ready
                </div>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-neutral-300">
                ProFixIQ surfaces your top repairs, pre-builds starter menus and inspections, and
                highlights missed packages — so you can start writing smarter work orders on day one.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT: owner snapshot + CAPABILITIES RAIL */}
        <div className="relative">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6 backdrop-blur">
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
              As soon as imports finish, you get a Shop Health Snapshot: top repairs, comeback risks,
              average RO, and fleet downtime signals — less like “new software”, more like a diagnostic
              scan for your business.
            </p>

            {/* Capabilities rail (animated, NOT upsells) */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/15 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                    Included capabilities (day one)
                  </div>
                  <div className="mt-2 text-sm font-semibold text-neutral-200">
                    Everything is accessible from day one — roll it out at your pace (training + adoption),
                    not with add-on pricing.
                  </div>
                </div>

                <div
                  className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em]"
                  style={{
                    borderColor: "rgba(255,255,255,0.14)",
                    backgroundColor: "rgba(15,23,42,0.35)",
                    color: "rgba(226,232,240,0.82)",
                  }}
                >
                  No extra cost
                </div>
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

                  {/* active hop ring (moves per chip) */}
                  <div className="pointer-events-none absolute left-0 right-0 top-[6px]">
                    <div
                      className="pfq-cap-hop grid gap-2"
                      style={{
                        gridTemplateColumns: `repeat(${chipCount}, minmax(0, 1fr))`,
                        animation: "pfqCapHop5 5.5s steps(1) infinite",
                      }}
                    >
                      <div className="flex justify-center">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-full"
                          style={{
                            boxShadow:
                              "0 0 0 1px rgba(197,122,74,0.22) inset, 0 0 26px rgba(197,122,74,0.18)",
                            background: "rgba(0,0,0,0.10)",
                          }}
                        >
                          <span
                            className="pfq-cap-breathe h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor: "rgba(197,122,74,0.98)",
                              boxShadow: "0 0 22px rgba(197,122,74,0.60)",
                              animation: "pfqCapBreathe 1.2s ease-in-out infinite",
                            }}
                          />
                        </div>
                      </div>
                      {/* placeholders */}
                      {Array.from({ length: chipCount - 1 }).map((_, i) => (
                        <div key={i} />
                      ))}
                    </div>
                  </div>

                  {/* chips row */}
                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${chipCount}, minmax(0, 1fr))` }}
                  >
                    {INCLUDED_MODULES.map((c) => (
                      <div key={c.label} className="flex justify-center">
                        <span
                          className="w-full rounded-full border border-white/12 bg-black/30 px-3 py-2 text-center text-[12px] font-semibold text-neutral-200"
                          style={{
                            boxShadow: "0 0 22px rgba(15,23,42,0.55)",
                          }}
                        >
                          {c.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 text-xs text-neutral-400">
                  Nothing is paywalled. Rollout is about adoption — not upgrading.
                </div>
              </div>

              {/* tiny “promise” band */}
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

          {/* copper signal wash */}
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
            style={{ background: "rgba(197,122,74,0.14)" }}
          />
          <div
            className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full blur-3xl"
            style={{ background: "rgba(15,23,42,0.35)" }}
          />
        </div>
      </div>

      {/* divider into next section */}
      <div className="mt-10 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </section>
  );
}