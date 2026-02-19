"use client";

const COPPER = "var(--pfq-copper)";
const COPPER_LIGHT = "var(--accent-copper-light)";

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

function PillarLane({ p, idx }: { p: Pillar; idx: number }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/10">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.05) inset, 0 18px 60px rgba(0,0,0,0.35)",
        }}
      />

      <div
        className="pointer-events-none absolute h-72 w-72 rounded-full blur-3xl opacity-60"
        style={{
          backgroundColor: "rgba(197,122,74,0.16)",
          top: idx % 2 === 0 ? "-120px" : "auto",
          bottom: idx % 2 === 1 ? "-120px" : "auto",
          right: "-140px",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(115deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.00) 2px, rgba(0,0,0,0.35) 6px)",
        }}
      />

      <div className="relative p-6 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-neutral-400">
            <SignalDot />
            <span style={{ color: "rgba(226,232,240,0.78)" }}>{p.kicker}</span>
          </div>

          <div
            className="rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em]"
            style={{
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(197,122,74,0.10)",
              color: COPPER_LIGHT,
            }}
          >
            Included
          </div>
        </div>

        <h3
          className="mt-3 text-2xl text-white sm:text-3xl"
          style={{ fontFamily: "var(--font-blackops)" }}
        >
          {p.title}
        </h3>

        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-300 sm:text-base">
          {p.description}
        </p>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {p.includes.map((x) => (
            <div
              key={x}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"
            >
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: COPPER,
                  boxShadow: "0 0 18px rgba(197,122,74,0.35)",
                }}
                aria-hidden
              />
              <span className="text-sm text-neutral-200">{x}</span>
            </div>
          ))}
        </div>

        <div className="mt-7 flex items-center gap-2">
          <div className="h-px flex-1 bg-white/5" />
          <div className="h-[2px] w-14 rounded-full" style={{ backgroundColor: COPPER }} />
        </div>
      </div>
    </div>
  );
}

export default function FeaturesSection({ showHeading = false }: FeaturesSectionProps) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle_at_20%_10%, rgba(197,122,74,0.14), transparent 55%)," +
              "radial-gradient(circle_at_80%_80%, rgba(15,23,42,0.75), #020617 70%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.00) 3px, rgba(0,0,0,0.45) 8px)",
          }}
        />
        <div
          className="absolute left-4 top-0 h-full w-px opacity-60 sm:left-6"
          style={{
            background:
              "linear-gradient(to bottom, transparent, rgba(197,122,74,0.55), rgba(197,122,74,0.18), transparent)",
            boxShadow: "0 0 28px rgba(197,122,74,0.25)",
          }}
        />
      </div>

      <div className="space-y-10">
        {showHeading ? (
          <div className="mx-auto max-w-3xl text-center">
            <div
              className="text-xs font-semibold uppercase tracking-[0.22em]"
              style={{ color: COPPER_LIGHT }}
            >
              Included
            </div>

            <h2
              className="mt-2 text-3xl text-white md:text-5xl"
              style={{
                fontFamily: "var(--font-blackops)",
                textShadow: "0 0 48px rgba(0,0,0,0.75)",
              }}
            >
              Everything included.{" "}
              <span style={{ color: COPPER }}>One&nbsp;workflow</span>.
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-sm text-neutral-300 sm:text-base">
              Fleet-first tools that also work great for automotive — built to reduce screen time and keep work moving.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {PILLARS.map((p, idx) => (
            <PillarLane key={p.kicker} p={p} idx={idx} />
          ))}
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/10 p-6 backdrop-blur-xl">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
            style={{ background: "rgba(197,122,74,0.12)" }}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-base font-extrabold text-white">
                This system gets smarter the more you use it.
              </div>
              <div className="mt-1 text-sm text-neutral-300">
                Automation and suggestions improve as your inspections, quotes, and work orders grow.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1">
                <SignalDot />
                Less screen time
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1">
                <SignalDot />
                Faster approvals
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1">
                <SignalDot />
                Cleaner billing
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}