"use client";

const COPPER = "var(--pfq-copper)";

type Pillar = {
  kicker: string;
  title: string;
  description: string;
  includes: string[];
};

const PILLARS: Pillar[] = [
  {
    kicker: "INSPECTIONS + EVIDENCE",
    title: "Measured inspections that flow into approvals.",
    description:
      "Corner grids, photos, notes, and voice — captured once, carried through to quotes and invoices.",
    includes: [
      "HD inspections + corner grids",
      "Custom inspection builder (truck / trailer / bus / automotive)",
      "Voice-controlled inspections (less typing, faster flow)",
      "Evidence trail (photos, videos, measurements) attached to the job",
    ],
  },
  {
    kicker: "WORK ORDERS + AUTOMATION",
    title: "No retyping the same job three times.",
    description:
      "Turn findings into clean lines, estimates, and approvals — with automation that matches how fleets decide.",
    includes: [
      "Work order + quote automation",
      "Menu item creation (packages from real shop history)",
      "Approval workflows (customer + fleet)",
      "Follow-ups and reminders that keep work moving",
    ],
  },
  {
    kicker: "PARTS + PURCHASING",
    title: "Parts move with the job — not a separate system.",
    description:
      "Requests, receiving, allocations, and PO automation built into the workflow so techs stay working.",
    includes: [
      "Parts request system (tech → parts visibility)",
      "Receiving + allocations + status tracking",
      "Quote & PO automation",
      "Inventory-aware workflows (where it makes sense)",
    ],
  },
  {
    kicker: "PORTALS + MOBILE + AI",
    title: "Fleet transparency, tech speed, admin leverage.",
    description:
      "Purpose-built portals and a mobile companion, plus an AI assistant that reduces admin overhead.",
    includes: [
      "Fleet portal (status, approvals, evidence, history)",
      "Customer portal (clean approvals + documentation)",
      "Mobile companion for techs + advisors",
      "AI assistant for admin tasks + AI-assisted diagnosis",
      "Internal agent for live requests (bugs + feature requests in-app)",
    ],
  },
];

type FeaturesSectionProps = {
  showHeading?: boolean;
};

function PillarBlock({ p }: { p: Pillar }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/20 p-6 backdrop-blur-xl shadow-[0_28px_90px_rgba(0,0,0,0.65)]">
      {/* copper signal */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full blur-3xl opacity-50"
        style={{ backgroundColor: "rgba(197,122,74,0.20)" }}
      />

      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-neutral-400">
          {p.kicker}
        </div>

        <h3
          className="mt-2 text-2xl text-neutral-50 sm:text-3xl"
          style={{ fontFamily: "var(--font-blackops)" }}
        >
          {p.title}
        </h3>

        <p className="mt-3 text-sm leading-relaxed text-neutral-300">
          {p.description}
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {p.includes.map((x) => (
            <div key={x} className="flex items-start gap-3">
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: COPPER, boxShadow: "0 0 18px rgba(197,122,74,0.35)" }}
              />
              <span className="text-sm text-neutral-200">{x}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-2">
          <div className="h-px flex-1 bg-white/5" />
          <div
            className="h-[2px] w-12 rounded-full"
            style={{ backgroundColor: COPPER }}
          />
        </div>
      </div>
    </div>
  );
}

export default function FeaturesSection({ showHeading = false }: FeaturesSectionProps) {
  return (
    <div className="space-y-10">
      {showHeading ? (
        <div className="mx-auto max-w-3xl text-center">
          <div
            className="text-xs font-semibold uppercase tracking-[0.22em]"
            style={{ color: COPPER }}
          >
            Everything included
          </div>
          <h2
            className="mt-2 text-3xl text-neutral-50 md:text-4xl"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            One workflow. Built for fleet reality.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-neutral-300">
            Heavy-duty and fleet first — works great for automotive too. Reduce
            retyping, speed approvals, and keep evidence attached from inspection
            to invoice.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {PILLARS.map((p) => (
          <PillarBlock key={p.kicker} p={p} />
        ))}
      </div>

      {/* small “system promise” band */}
      <div className="rounded-3xl border border-white/10 bg-black/15 p-6 backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-neutral-50">
              This system gets smarter the more you use it.
            </div>
            <div className="mt-1 text-sm text-neutral-300">
              Automation and suggestions improve as your inspections, quotes, and work orders grow.
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: COPPER }}
            />
            Less screen time
            <span className="text-white/10">•</span>
            Faster approvals
            <span className="text-white/10">•</span>
            Cleaner billing
          </div>
        </div>
      </div>
    </div>
  );
}