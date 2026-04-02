//features/shared/components/ui/RealShopDayFlow.tsx

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const COPPER = "var(--pfq-copper)";
const COPPER_LIGHT = "var(--accent-copper-light)";

type Step = {
  n: string;
  title: string;
  who: "Advisor" | "Technician" | "Parts" | "Portal" | "Shop";
  outcome: string;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Create the work order",
    who: "Advisor",
    outcome: "Vehicle + concern captured. Tech can start immediately.",
  },
  {
    n: "02",
    title: "Inspect by voice",
    who: "Technician",
    outcome:
      "Fail / recommend items hands-free with proof + measurements attached.",
  },
  {
    n: "03",
    title: "Tech builds the repair line",
    who: "Technician",
    outcome:
      "Add parts + labor once (accuracy stays on the floor — advisors don’t re-quote).",
  },
  {
    n: "04",
    title: "Parts quotes & confirms",
    who: "Parts",
    outcome:
      "Quote, allocate, or order. Status stays tied to the job and updates automatically.",
  },
  {
    n: "05",
    title: "Advisor reviews & sends approval",
    who: "Advisor",
    outcome:
      "Clean review — push to customer or fleet portal with evidence in one click.",
  },
  {
    n: "06",
    title: "Customer / fleet approves",
    who: "Portal",
    outcome: "Approve/decline with proof. No phone tag.",
  },
  {
    n: "07",
    title: "Parts moves automatically",
    who: "Parts",
    outcome:
      "Approved lines trigger pick/order workflows and keep everyone in sync.",
  },
  {
    n: "08",
    title: "Repair, invoice, history",
    who: "Shop",
    outcome:
      "Work completes → invoice is clean → proof stays attached forever in the portal.",
  },
];

function Dot() {
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

function WhoPill({ who }: { who: Step["who"] }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em]"
      style={{
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(0,0,0,0.30)",
        color: "rgba(255,255,255,0.78)",
      }}
    >
      <Dot />
      {who}
    </span>
  );
}

type QuoteMode = "traditional" | "profixiq";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-neutral-200">
      {children}
    </span>
  );
}

function GhostButton(props: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="rounded-xl border px-3 py-2 text-sm font-extrabold transition"
      style={{
        borderColor: props.active ? "rgba(197,122,74,0.55)" : "rgba(255,255,255,0.12)",
        background: props.active ? "rgba(197,122,74,0.12)" : "rgba(0,0,0,0.25)",
        color: props.active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.80)",
        boxShadow: props.active
          ? "0 0 0 1px rgba(197,122,74,0.14) inset, 0 0 24px rgba(197,122,74,0.12)"
          : "0 0 0 1px rgba(255,255,255,0.04) inset",
      }}
    >
      {props.children}
    </button>
  );
}

export default function RealShopDayFlow() {
  const [mode, setMode] = useState<QuoteMode>("profixiq");

  const preview = useMemo(() => {
    const concern = "Rear brake pads low";
    const measurement = "2mm";
    const line = "Rear brake pads + hardware";
    const parts = [
      { name: "Rear brake pad set", qty: 1, price: 189.0 },
      { name: "Hardware kit", qty: 1, price: 28.0 },
    ];
    const laborHours = 1.5;
    const laborRate = 170;
    const labor = laborHours * laborRate;
    const partsTotal = parts.reduce((a, p) => a + p.qty * p.price, 0);
    const subtotal = partsTotal + labor;

    return { concern, measurement, line, parts, laborHours, laborRate, labor, partsTotal, subtotal };
  }, []);

  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-12 sm:py-14">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-neutral-300">
              <Dot />
              <span style={{ color: COPPER_LIGHT }}>Real shop day</span>
              <span className="text-white/10">•</span>
              <span className="text-neutral-400">
                This is what “one workflow” means
              </span>
            </div>

            <h2
              className="mt-4 text-3xl leading-[1.05] text-white sm:text-4xl md:text-5xl"
              style={{
                fontFamily: "var(--font-blackops)",
                textShadow: "0 0 46px rgba(0,0,0,0.85)",
              }}
            >
              Inspect → approve → parts → invoice. Without the gaps.
            </h2>

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-200 sm:text-base">
              ProFixIQ is built around how the floor actually works: techs do the
              repair thinking, parts quotes, advisors review, and customers/fleets
              approve with proof — all in one connected chain.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/demo/instant-shop-analysis"
              className="rounded-xl px-5 py-3 text-sm font-extrabold text-black transition hover:brightness-110 active:scale-[0.99]"
              style={{
                background:
                  "linear-gradient(to right, var(--accent-copper-soft), var(--accent-copper))",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 0 34px rgba(197,122,74,0.20)",
              }}
            >
              Run Instant Shop Analysis
            </Link>

            <Link
              href="#features"
              className="rounded-xl border border-white/10 bg-black/20 px-5 py-3 text-sm font-semibold text-neutral-100 transition hover:border-white/20 hover:bg-black/30"
            >
              See what’s included
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-xl sm:p-5">
          <div className="grid gap-3 md:grid-cols-2">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-xl border border-white/10 bg-black/15 px-4 py-4 backdrop-blur-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-[11px] font-extrabold uppercase tracking-[0.22em]"
                        style={{ color: COPPER_LIGHT }}
                      >
                        Step {s.n}
                      </span>
                      <WhoPill who={s.who} />
                    </div>

                    <div className="mt-2 text-base font-extrabold text-white sm:text-lg">
                      {s.title}
                    </div>
                    <div className="mt-1 text-sm text-neutral-300">
                      {s.outcome}
                    </div>
                  </div>

                  <div className="mt-1 hidden sm:block">
                    <div
                      className="h-10 w-10 rounded-xl border"
                      style={{
                        borderColor: "rgba(255,255,255,0.10)",
                        background:
                          "radial-gradient(circle at 30% 30%, rgba(197,122,74,0.20), rgba(0,0,0,0) 70%)",
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <div className="text-xs text-neutral-400">
              Built for HD + fleet reality • Works great for automotive • Scales
              to multi-location
            </div>

            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Dot />
              <span>
                Key idea: the job carries proof, status, and parts trail end-to-end.
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-xl sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-neutral-300">
                <Dot />
                <span style={{ color: COPPER_LIGHT }}>Proof quote preview</span>
                <span className="text-white/10">•</span>
                <span className="text-neutral-400">See why approvals move faster</span>
              </div>

              <div className="mt-3 text-lg font-extrabold text-white sm:text-xl">
                Traditional quotes make customers guess. ProFixIQ shows the proof.
              </div>
              <p className="mt-2 max-w-2xl text-sm text-neutral-300">
                Same job. Same price. Two different approval experiences.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <GhostButton active={mode === "traditional"} onClick={() => setMode("traditional")}>
                Traditional
              </GhostButton>
              <GhostButton active={mode === "profixiq"} onClick={() => setMode("profixiq")}>
                ProFixIQ
              </GhostButton>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-xl border border-white/10 bg-black/15 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                    Example line
                  </div>
                  <div className="mt-1 text-lg font-extrabold text-white">
                    {preview.line}
                  </div>

                  {mode === "profixiq" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>
                        Concern: <span className="ml-1 text-neutral-100">{preview.concern}</span>
                      </Badge>
                      <Badge>
                        Measured:{" "}
                        <span className="ml-1 text-neutral-100">{preview.measurement}</span>
                      </Badge>
                    </div>
                  ) : null}
                </div>

                <span
                  className="rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em]"
                  style={{
                    borderColor: "rgba(255,255,255,0.14)",
                    backgroundColor:
                      mode === "profixiq"
                        ? "rgba(197,122,74,0.10)"
                        : "rgba(255,255,255,0.06)",
                    color:
                      mode === "profixiq"
                        ? COPPER_LIGHT
                        : "rgba(255,255,255,0.78)",
                  }}
                >
                  {mode === "profixiq" ? "Proof-first" : "Basic quote"}
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {preview.parts.map((part) => (
                  <div
                    key={part.name}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  >
                    <div className="text-neutral-200">
                      {part.qty} × {part.name}
                    </div>
                    <div className="font-semibold text-white">
                      ${part.price.toFixed(0)}
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                  <div className="text-neutral-200">
                    Labor ({preview.laborHours.toFixed(1)}h @ ${preview.laborRate}/h)
                  </div>
                  <div className="font-semibold text-white">
                    ${preview.labor.toFixed(0)}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm">
                  <div className="font-semibold text-neutral-300">Subtotal</div>
                  <div className="text-base font-extrabold text-white">
                    ${preview.subtotal.toFixed(0)}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/15 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                Approval experience
              </div>

              {mode === "traditional" ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-neutral-300">
                    Replace rear brake pads and hardware.
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-neutral-500">
                    No measurements shown.
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-neutral-500">
                    No supporting evidence attached.
                  </div>
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-100">
                    Customer has to trust the quote without seeing what you saw.
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-neutral-300">
                    Rear brake pads measured at <span className="font-semibold text-white">2mm</span>.
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-neutral-300">
                    Evidence and inspection notes stay attached to the job.
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-neutral-300">
                    Portal approval happens with context, not guesswork.
                  </div>
                  <div className="rounded-xl border border-[rgba(197,122,74,0.28)] bg-[rgba(197,122,74,0.10)] px-4 py-3 text-sm text-neutral-100">
                    Customer sees the proof, understands the urgency, and approves faster.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
