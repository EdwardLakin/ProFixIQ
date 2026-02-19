"use client";

const COPPER = "var(--pfq-copper)";

type Row = {
  label: string;
  oldWay: string;
  newWay: string;
};

const ROWS: Row[] = [
  {
    label: "Inspections",
    oldWay: "Paper/forms → retype findings → missing photos and measurements.",
    newWay: "Corner grids + evidence captured once, attached forever.",
  },
  {
    label: "Quotes",
    oldWay: "Rewrite the same job from notes, then chase approvals.",
    newWay: "Findings become lines automatically with proof-based approvals.",
  },
  {
    label: "Parts",
    oldWay: "Tech asks, parts guesses, advisors follow up, status is unclear.",
    newWay: "Requests + receiving + allocation tied to the work order flow.",
  },
  {
    label: "Fleet visibility",
    oldWay: "Phone calls and emails for status + approval, no audit trail.",
    newWay: "Fleet portal shows status, evidence, approvals, and history.",
  },
];

export default function WhySection() {
  return (
    <div className="mx-auto max-w-6xl text-white">
      <div className="text-center">
        <div
          className="text-xs font-semibold uppercase tracking-[0.22em]"
          style={{ color: COPPER }}
        >
          Why it wins
        </div>

        <h2
          className="mt-2 text-3xl text-neutral-50 md:text-4xl"
          style={{ fontFamily: "var(--font-blackops)" }}
        >
          Clarity for techs. Control for advisors.
        </h2>

        <p className="mx-auto mt-3 max-w-3xl text-sm text-neutral-300 md:text-base">
          Built for heavy-duty &amp; fleet life — less screen time on the floor,
          faster decisions for fleets, and a defensible evidence trail from bay to invoice.
        </p>
      </div>

      {/* TABLE + DEPTH BACKPLATE */}
      <div className="relative mt-10 overflow-hidden rounded-3xl border border-white/10 bg-black/20 backdrop-blur-xl">
        {/* depth layers */}
        <div className="pointer-events-none absolute inset-0">
          {/* copper wash */}
          <div
            className="absolute -right-24 -top-24 h-80 w-80 rounded-full blur-3xl"
            style={{ background: "rgba(197,122,74,0.12)" }}
          />
          {/* steel wash */}
          <div
            className="absolute -left-28 -bottom-28 h-96 w-96 rounded-full blur-3xl"
            style={{ background: "rgba(15,23,42,0.42)" }}
          />
          {/* brushed grain */}
          <div
            className="absolute inset-0 opacity-[0.10]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.00) 3px, rgba(0,0,0,0.45) 9px)",
            }}
          />
          {/* inner groove */}
          <div
            className="absolute inset-0"
            style={{
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.05) inset, 0 18px 70px rgba(0,0,0,0.45)",
            }}
          />
        </div>

        {/* header row */}
        <div className="relative grid grid-cols-12 gap-0 border-b border-white/10 px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
          <div className="col-span-12 sm:col-span-3">Area</div>
          <div className="col-span-12 sm:col-span-4">Traditional</div>

          {/* ProFixIQ header gets a subtle copper “active” cue */}
          <div className="col-span-12 sm:col-span-5">
            <span className="inline-flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: COPPER,
                  boxShadow: "0 0 18px rgba(197,122,74,0.55)",
                }}
                aria-hidden
              />
              ProFixIQ
            </span>
          </div>
        </div>

        {/* rows */}
        <div className="relative divide-y divide-white/10">
          {ROWS.map((r) => (
            <div key={r.label} className="grid grid-cols-12 gap-0 px-5 py-5">
              <div className="col-span-12 sm:col-span-3">
                <div className="text-sm font-semibold text-neutral-50">{r.label}</div>
              </div>

              <div className="col-span-12 mt-2 text-sm text-neutral-300 sm:col-span-4 sm:mt-0">
                {r.oldWay}
              </div>

              {/* ProFixIQ column highlight: faint border + glow + inset */}
              <div className="col-span-12 mt-2 sm:col-span-5 sm:mt-0">
                <div
                  className="relative rounded-2xl border border-white/10 bg-black/15 px-4 py-3"
                  style={{
                    boxShadow:
                      "0 0 0 1px rgba(197,122,74,0.07) inset, 0 0 28px rgba(197,122,74,0.10)",
                  }}
                >
                  <div
                    className="pointer-events-none absolute left-0 top-3 h-[calc(100%-24px)] w-px"
                    style={{
                      background:
                        "linear-gradient(to bottom, transparent, rgba(197,122,74,0.55), rgba(197,122,74,0.18), transparent)",
                      boxShadow: "0 0 18px rgba(197,122,74,0.20)",
                    }}
                  />
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: COPPER,
                        boxShadow: "0 0 20px rgba(197,122,74,0.35)",
                      }}
                      aria-hidden
                    />
                    <div className="text-sm text-neutral-200">{r.newWay}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* micro-CTA row */}
        <div className="relative border-t border-white/10 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-neutral-400">
              Less retyping. Faster approvals. Evidence that stays attached.
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="#plans"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/25 px-4 py-2 text-xs font-semibold text-neutral-200 hover:border-white/20 hover:bg-black/35"
              >
                See plans
              </a>

              <a
                href="#"
                className="inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-extrabold text-black"
                style={{
                  backgroundColor: "rgba(197,122,74,0.95)",
                  boxShadow: "0 0 30px rgba(197,122,74,0.25)",
                }}
              >
                Run Instant Shop Analysis
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* bottom punch line */}
      <div className="relative mt-6 overflow-hidden rounded-3xl border border-white/10 bg-black/15 p-6 backdrop-blur-xl">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
          style={{ background: "rgba(197,122,74,0.10)" }}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-neutral-50">
            Result: fewer misses without adding admin work.
          </div>
          <div className="text-xs text-neutral-400">
            Built for fleets • Works for automotive • Scales to multi-location
          </div>
        </div>
      </div>
    </div>
  );
}