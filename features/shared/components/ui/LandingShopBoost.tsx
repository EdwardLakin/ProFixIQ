"use client";

import { useEffect, useMemo, useState } from "react";

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

type StepCard = {
  num: "01" | "02" | "03";
  kicker: string;
  title: string;
  badge: string;
  body: string;
};

const STEPS: StepCard[] = [
  {
    num: "01",
    kicker: "Profile",
    title: "Tell us how your shop runs — we build around it.",
    badge: "Tailored",
    body: "Tell us what you run (fleet, mixed, diesel, automotive), how many bays/techs, and what data you have. We tailor the system to your workflow — not generic templates.",
  },
  {
    num: "02",
    kicker: "Upload",
    title: "Drag in customers, units, parts, history.",
    badge: "Import-ready",
    body: "Import CSVs or exports from your old system. ProFixIQ normalizes customers, vehicles, repair orders, and inventory into one clean record — ready for inspections and work orders.",
  },
  {
    num: "03",
    kicker: "Blueprint",
    title: "AI builds your shop operating plan.",
    badge: "Shop-ready",
    body: "ProFixIQ surfaces your top repairs, pre-builds starter menus and inspections, and highlights missed packages — so you can start writing smarter work orders on day one.",
  },
];

export default function LandingShopBoost() {
  const chips = useMemo(() => INCLUDED_MODULES, []);
  const [activeChipIdx, setActiveChipIdx] = useState(0);
  const [activeStepIdx, setActiveStepIdx] = useState(0);

  useEffect(() => {
    if (chips.length <= 1) return;
    const t = window.setInterval(() => {
      setActiveChipIdx((i) => (i + 1) % chips.length);
    }, 1100);
    return () => window.clearInterval(t);
  }, [chips.length]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setActiveStepIdx((i) => (i + 1) % 3);
    }, 1200);
    return () => window.clearInterval(t);
  }, []);

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

        @keyframes pfqStepPulse {
          0% {
            transform: translateY(0px) scale(1);
          }
          50% {
            transform: translateY(-1px) scale(1.03);
          }
          100% {
            transform: translateY(0px) scale(1);
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
          .pfq-step-pulse {
            animation: none !important;
          }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle_at_18%_10%, rgba(197,122,74,0.12), transparent 52%)," +
              "radial-gradient(circle_at_85%_20%, rgba(15,23,42,0.45), transparent 55%)," +
              "radial-gradient(circle_at_70%_85%, rgba(2,6,23,0.95), rgba(2,6,23,0.65) 55%, transparent 75%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.00) 3px, rgba(0,0,0,0.45) 9px)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.04) inset, 0 50px 120px rgba(0,0,0,0.55)",
          }}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="pt-10 text-center">
        <div className="mx-auto inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-neutral-300">
          <SignalDot />
          <span style={{ color: COPPER_LIGHT }}>Shop Boost Setup</span>
          <span className="text-white/10">•</span>
          <span className="text-neutral-400">Day-one ready</span>
        </div>

        <h2 className="mx-auto mt-4 max-w-4xl text-3xl font-semibold text-white sm:text-4xl">
          From blank system to shop-ready in{" "}
          <span style={{ color: COPPER_LIGHT }}>Just, Three, Steps</span>.
        </h2>

        <p className="mx-auto mt-4 max-w-4xl text-sm leading-relaxed text-neutral-300 sm:text-base">
          Don’t spend weeks configuring software. ProFixIQ reads how your shop
          already works and builds around it — inspections, menus, automation,
          and portals that match fleet reality.
        </p>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {STEPS.map((s, idx) => {
          const active = idx === activeStepIdx;

          return (
            <div
              key={s.num}
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/16 px-5 py-4 backdrop-blur-xl"
              style={{
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.04) inset, 0 18px 60px rgba(0,0,0,0.38)",
              }}
            >
              <div
                className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl"
                style={{ background: "rgba(197,122,74,0.10)" }}
              />
              <div
                className="pointer-events-none absolute -left-24 -bottom-24 h-64 w-64 rounded-full blur-3xl"
                style={{ background: "rgba(15,23,42,0.35)" }}
              />

              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    className={[
                      "mt-0.5 flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold",
                      active ? "pfq-step-pulse" : "",
                    ].join(" ")}
                    style={{
                      backgroundColor: active
                        ? "rgba(197,122,74,0.18)"
                        : "rgba(197,122,74,0.12)",
                      color: COPPER_LIGHT,
                      border: active
                        ? "1px solid rgba(197,122,74,0.55)"
                        : "1px solid rgba(197,122,74,0.30)",
                      boxShadow: active
                        ? "0 0 26px rgba(197,122,74,0.22), 0 0 0 1px rgba(197,122,74,0.12) inset"
                        : "0 0 18px rgba(197,122,74,0.10)",
                      animation: active
                        ? "pfqStepPulse 1.05s ease-in-out infinite"
                        : undefined,
                    }}
                    aria-label={`Step ${s.num}`}
                  >
                    {s.num}
                  </span>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                      {s.kicker}
                    </div>
                    <div className="mt-0.5 text-base font-extrabold text-white">
                      {s.title}
                    </div>
                  </div>
                </div>

                <div className="hidden items-center gap-2 text-xs text-neutral-400 sm:flex">
                  <SignalDot />
                  {s.badge}
                </div>
              </div>

              <p className="relative mt-3 text-sm leading-relaxed text-neutral-300">
                {s.body}
              </p>

              <div className="relative mt-5 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <div
                className="relative mt-2 h-[2px] w-16 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(197,122,74,0.0) 0%, rgba(197,122,74,0.85) 45%, rgba(197,122,74,0.0) 100%)",
                  filter: "drop-shadow(0 0 14px rgba(197,122,74,0.25))",
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/16 p-6 backdrop-blur-xl"
          style={{
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.04) inset, 0 18px 60px rgba(0,0,0,0.38)",
          }}
        >
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
            style={{ background: "rgba(197,122,74,0.10)" }}
          />

          <div className="relative flex items-start justify-between gap-3">
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
              Snapshot
            </span>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-neutral-300">
            A fast picture of what your shop actually does, where revenue hides,
            and which menus, inspections, and automations should be built first.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {chips.map((chip, idx) => {
              const active = idx === activeChipIdx;
              return (
                <span
                  key={chip.label}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition"
                  style={{
                    borderColor: active
                      ? "rgba(197,122,74,0.45)"
                      : "rgba(255,255,255,0.10)",
                    backgroundColor: active
                      ? "rgba(197,122,74,0.12)"
                      : "rgba(0,0,0,0.20)",
                    color: active
                      ? "rgba(255,255,255,0.92)"
                      : "rgba(226,232,240,0.82)",
                    boxShadow: active
                      ? "0 0 22px rgba(197,122,74,0.16)"
                      : "none",
                  }}
                >
                  <SignalDot />
                  {chip.label}
                </span>
              );
            })}
          </div>
        </div>

        <div
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/16 p-6 backdrop-blur-xl"
          style={{
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.04) inset, 0 18px 60px rgba(0,0,0,0.38)",
          }}
        >
          <div
            className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full blur-3xl"
            style={{ background: "rgba(15,23,42,0.34)" }}
          />

          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
            Why shops move fast here
          </div>
          <div className="mt-1 text-xl font-extrabold text-white">
            Setup becomes momentum — not a project.
          </div>

          <div className="mt-5 space-y-3">
            {[
              "Menus built from real history",
              "Starter inspections created automatically",
              "Workflow tuned to fleet + mixed shop reality",
              "Suggested packages surfaced immediately",
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/18 px-4 py-3"
              >
                <SignalDot />
                <div className="text-sm text-neutral-200">{item}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
