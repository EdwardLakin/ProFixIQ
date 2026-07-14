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
        backgroundColor: "var(--theme-surface-panel)",
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
    <span className="inline-flex items-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--theme-text-primary)]">
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
        background: props.active ? "rgba(197,122,74,0.12)" : "var(--theme-surface-inset)",
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
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--theme-text-secondary)]">
              <Dot />
              <span style={{ color: COPPER_LIGHT }}>Real shop day</span>
              <span className="text-[color:var(--theme-text-muted)]">•</span>
              <span className="text-[color:var(--theme-text-secondary)]">
                This is what “one workflow” means
              </span>
            </div>

            <h2
              className="mt-4 text-3xl leading-[1.05] text-[color:var(--theme-text-primary)] sm:text-4xl md:text-5xl"
              style={{
                fontFamily: "var(--font-blackops)",
                boxShadow: "var(--theme-shadow-medium)",
              }}
            >
              Inspect → approve → parts → invoice. Without the gaps.
            </h2>

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[color:var(--theme-text-primary)] sm:text-base">
              ProFixIQ is built around how the floor actually works: techs do the
              repair thinking, parts quotes, advisors review, and customers/fleets
              approve with proof — all in one connected chain.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/demo/instant-shop-analysis"
              className="rounded-xl px-5 py-3 text-sm font-extrabold text-[color:var(--theme-text-on-accent)] transition hover:brightness-110 active:scale-[0.99]"
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
              className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-5 py-3 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-inset)]"
            >
              See what’s included
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 backdrop-blur-xl sm:p-5">
          <div className="grid gap-3 md:grid-cols-2">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-4 backdrop-blur-sm"
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

                    <div className="mt-2 text-base font-extrabold text-[color:var(--theme-text-primary)] sm:text-lg">
                      {s.title}
                    </div>
                    <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                      {s.outcome}
                    </div>
                  </div>

                  <div className="mt-1 hidden sm:block">
                    <div
                      className="h-10 w-10 rounded-xl border"
                      style={{
                        borderColor: "rgba(255,255,255,0.10)",
                        background:
                          "var(--theme-gradient-panel)",
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--theme-border-soft)] pt-4">
            <div className="text-xs text-[color:var(--theme-text-secondary)]">
              Built for HD + fleet reality • Works great for automotive • Scales
              to multi-location
            </div>

            <div className="flex items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]">
              <Dot />
              <span>
                Key idea: the job carries proof, status, and parts trail end-to-end.
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 backdrop-blur-xl sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--theme-text-secondary)]">
                <Dot />
                <span style={{ color: COPPER_LIGHT }}>Proof quote preview</span>
                <span className="text-[color:var(--theme-text-muted)]">•</span>
                <span className="text-[color:var(--theme-text-secondary)]">See why approvals move faster</span>
              </div>

              <div className="mt-3 text-lg font-extrabold text-[color:var(--theme-text-primary)] sm:text-xl">
                Traditional quotes make customers guess. ProFixIQ shows the proof.
              </div>
              <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
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
            <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
                    Example line
                  </div>
                  <div className="mt-1 text-lg font-extrabold text-[color:var(--theme-text-primary)]">
                    {preview.line}
                  </div>

                  {mode === "profixiq" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>
                        Concern: <span className="ml-1 text-[color:var(--theme-text-primary)]">{preview.concern}</span>
                      </Badge>
                      <Badge>
                        Measured:{" "}
                        <span className="ml-1 text-[color:var(--theme-text-primary)]">{preview.measurement}</span>
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
                    className="flex items-center justify-between rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm"
                  >
                    <div className="text-[color:var(--theme-text-primary)]">
                      {part.qty} × {part.name}
                    </div>
                    <div className="font-semibold text-[color:var(--theme-text-primary)]">
                      ${part.price.toFixed(0)}
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm">
                  <div className="text-[color:var(--theme-text-primary)]">
                    Labor ({preview.laborHours.toFixed(1)}h @ ${preview.laborRate}/h)
                  </div>
                  <div className="font-semibold text-[color:var(--theme-text-primary)]">
                    ${preview.labor.toFixed(0)}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[color:var(--theme-border-soft)] pt-3 text-sm">
                  <div className="font-semibold text-[color:var(--theme-text-secondary)]">Subtotal</div>
                  <div className="text-base font-extrabold text-[color:var(--theme-text-primary)]">
                    ${preview.subtotal.toFixed(0)}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
                Approval experience
              </div>

              {mode === "traditional" ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
                    Replace rear brake pads and hardware.
                  </div>
                  <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-muted)]">
                    No measurements shown.
                  </div>
                  <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-muted)]">
                    No supporting evidence attached.
                  </div>
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-100">
                    Customer has to trust the quote without seeing what you saw.
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
                    Rear brake pads measured at <span className="font-semibold text-[color:var(--theme-text-primary)]">2mm</span>.
                  </div>
                  <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
                    Evidence and inspection notes stay attached to the job.
                  </div>
                  <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
                    Portal approval happens with context, not guesswork.
                  </div>
                  <div className="rounded-xl border border-[rgba(197,122,74,0.28)] bg-[rgba(197,122,74,0.10)] px-4 py-3 text-sm text-[color:var(--theme-text-primary)]">
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
