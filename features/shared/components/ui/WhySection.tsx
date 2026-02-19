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

      <div className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-black/20 backdrop-blur-xl">
        {/* header row */}
        <div className="grid grid-cols-12 gap-0 border-b border-white/10 px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
          <div className="col-span-12 sm:col-span-3">Area</div>
          <div className="col-span-12 sm:col-span-4">Traditional</div>
          <div className="col-span-12 sm:col-span-5">ProFixIQ</div>
        </div>

        {/* rows */}
        <div className="divide-y divide-white/10">
          {ROWS.map((r) => (
            <div key={r.label} className="grid grid-cols-12 gap-0 px-5 py-5">
              <div className="col-span-12 sm:col-span-3">
                <div className="text-sm font-semibold text-neutral-50">{r.label}</div>
              </div>

              <div className="col-span-12 mt-2 text-sm text-neutral-300 sm:col-span-4 sm:mt-0">
                {r.oldWay}
              </div>

              <div className="col-span-12 mt-2 sm:col-span-5 sm:mt-0">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: COPPER,
                      boxShadow: "0 0 20px rgba(197,122,74,0.35)",
                    }}
                  />
                  <div className="text-sm text-neutral-200">{r.newWay}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* bottom punch line */}
      <div className="mt-6 rounded-3xl border border-white/10 bg-black/15 p-6 backdrop-blur-xl">
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