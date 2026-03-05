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
    // A concrete example that matches HD/fleet reality + your workflow
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
        {/* Header */}
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
              className="rounded-xl border border-white/10 bg-black/20 px-5 py-3 text-sm font-semibold text-neutral-100 transition hover:bg-black/30"
            >
              See what’s included
            </Link>
          </div>
        </div>

        {/* Flow grid */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur sm:p-5">
          <div className="grid gap-3 md:grid-cols-2">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-xl border border-white/10 bg-black/15 px-4 py-4"
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

        {/* Interactive proof quote preview (placed immediately after the flow) */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur sm:p-5">
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
            {/* Left: preview card */}
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
                      <Badge>Evidence attached</Badge>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>Parts + labor</Badge>
                      <Badge>No proof attached</Badge>
                      <Badge>Approval via phone/email</Badge>
                    </div>
                  )}
                </div>

                <div
                  className="hidden sm:block rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em]"
                  style={{
                    borderColor: "rgba(255,255,255,0.14)",
                    backgroundColor: mode === "profixiq" ? "rgba(197,122,74,0.10)" : "rgba(255,255,255,0.04)",
                    color: mode === "profixiq" ? COPPER_LIGHT : "rgba(255,255,255,0.70)",
                  }}
                >
                  {mode === "profixiq" ? "Proof-based" : "Basic"}
                </div>
              </div>

              {/* Evidence block (only shows in ProFixIQ mode) */}
              {mode === "profixiq" && (
                <div className="mt-4 grid gap-3 md:grid-cols-[0.55fr_0.45fr]">
                  <div
                    className="rounded-xl border border-white/10 bg-black/30 p-3"
                    style={{
                      background:
                        "radial-gradient(circle at 30% 20%, rgba(197,122,74,0.14), rgba(0,0,0,0.25) 70%)",
                    }}
                  >
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                      Evidence
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="aspect-[4/3] rounded-lg border border-white/10 bg-black/40" />
                      <div className="aspect-[4/3] rounded-lg border border-white/10 bg-black/40" />
                    </div>
                    <div className="mt-2 text-xs text-neutral-400">
                      Photos/measurements stay attached to the job and portal history.
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                      Measurement
                    </div>
                    <div className="mt-2 text-3xl font-extrabold text-white">
                      {preview.measurement}
                    </div>
                    <div className="mt-1 text-xs text-neutral-400">
                      Captured during inspection.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>Inspection</Badge>
                      <Badge>Repair line</Badge>
                      <Badge>Portal approval</Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* Pricing block */}
              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-extrabold text-white">Estimate</div>
                  <div className="text-sm font-extrabold text-white">
                    ${preview.subtotal.toFixed(2)}
                  </div>
                </div>

                <div className="mt-2 space-y-1 text-sm text-neutral-300">
                  <div className="flex items-center justify-between">
                    <span>Labor ({preview.laborHours.toFixed(1)}h @ ${preview.laborRate}/h)</span>
                    <span>${preview.labor.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Parts</span>
                    <span>${preview.partsTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-3 border-t border-white/10 pt-3 text-xs text-neutral-400">
                  {mode === "profixiq"
                    ? "Customer/fleet sees the proof and approves inside the portal."
                    : "Customer/fleet sees a list and asks questions (slow approvals)."}
                </div>
              </div>
            </div>

            {/* Right: approval “portal feel” */}
            <div className="rounded-xl border border-white/10 bg-black/15 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                    Approval experience
                  </div>
                  <div className="mt-1 text-lg font-extrabold text-white">
                    {mode === "profixiq" ? "Portal approval (fast)" : "Back-and-forth (slow)"}
                  </div>
                </div>

                <span
                  className="rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em]"
                  style={{
                    borderColor: "rgba(255,255,255,0.14)",
                    backgroundColor: "rgba(0,0,0,0.30)",
                    color: "rgba(255,255,255,0.75)",
                  }}
                >
                  {mode === "profixiq" ? "Evidence shown" : "Evidence missing"}
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
                <div className="text-sm font-extrabold text-white">
                  {preview.line}
                </div>

                <div className="mt-2 text-sm text-neutral-300">
                  {mode === "profixiq" ? (
                    <>
                      Rear pads measured at <span className="text-neutral-100 font-semibold">{preview.measurement}</span>. Photos +
                      inspection notes attached. Approve/decline below.
                    </>
                  ) : (
                    <>
                      Rear pads + hardware. Customer asks: “How bad is it?” “Do you have photos?” “Can I wait?”
                    </>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {mode === "profixiq" ? (
                    <>
                      <Badge>Proof</Badge>
                      <Badge>Clear scope</Badge>
                      <Badge>One-click decision</Badge>
                    </>
                  ) : (
                    <>
                      <Badge>Questions</Badge>
                      <Badge>Phone tag</Badge>
                      <Badge>Delays</Badge>
                    </>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-xl px-4 py-2 text-sm font-extrabold text-black transition active:scale-[0.99]"
                    style={{
                      background:
                        "linear-gradient(to right, var(--accent-copper-soft), var(--accent-copper))",
                      border: "1px solid rgba(255,255,255,0.10)",
                      boxShadow: "0 0 26px rgba(197,122,74,0.22)",
                      opacity: mode === "profixiq" ? 1 : 0.55,
                      cursor: mode === "profixiq" ? "pointer" : "default",
                    }}
                    disabled={mode !== "profixiq"}
                  >
                    Approve
                  </button>

                  <button
                    type="button"
                    className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-extrabold text-neutral-100 transition hover:bg-black/30 active:scale-[0.99]"
                    style={{
                      opacity: mode === "profixiq" ? 1 : 0.55,
                      cursor: mode === "profixiq" ? "pointer" : "default",
                    }}
                    disabled={mode !== "profixiq"}
                  >
                    Decline
                  </button>
                </div>

                <div className="mt-3 text-xs text-neutral-500">
                  {mode === "profixiq"
                    ? "This is what your customer/fleet sees in the portal."
                    : "This is why traditional systems stall approvals."}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                    What changes operationally
                  </div>
                  <Dot />
                </div>

                <ul className="mt-2 space-y-2 text-sm text-neutral-300">
                  <li className="flex gap-2">
                    <span style={{ color: COPPER_LIGHT }}>•</span>
                    Tech enters the truth once (parts + labor + proof).
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: COPPER_LIGHT }}>•</span>
                    Parts quotes without breaking the workflow.
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: COPPER_LIGHT }}>•</span>
                    Advisor reviews — not retypes — then sends approvals.
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: COPPER_LIGHT }}>•</span>
                    Portal decisions update job + parts flow automatically.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <div className="text-xs text-neutral-400">
              Want this exact flow? It’s already how ProFixIQ is designed to run.
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/demo/instant-shop-analysis"
                className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-900/40"
              >
                See a real snapshot
              </Link>
              <Link
                href="/onboarding/profile"
                className="rounded-xl px-4 py-2 text-sm font-extrabold text-black"
                style={{
                  background: "var(--pfq-copper)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  boxShadow: "0 0 26px rgba(197,122,74,0.20)",
                }}
              >
                Start onboarding
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* soft copper wash */}
      <div
        className="pointer-events-none absolute left-[-120px] top-[40%] h-72 w-72 rounded-full blur-3xl"
        style={{ background: "rgba(197,122,74,0.12)" }}
      />
    </section>
  );
}