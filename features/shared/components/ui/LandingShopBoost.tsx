// features/shared/components/ui/LandingShopBoost.tsx
"use client";

const COPPER = "var(--pfq-copper)";

export default function LandingShopBoost() {
  return (
    <section className="relative mx-auto mt-4 max-w-5xl px-4 pb-20 sm:pb-28">
      {/* background hint line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px max-w-3xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div
        className="
          relative mx-auto max-w-4xl
          overflow-hidden rounded-3xl
          border border-[color:var(--metal-border-soft,#1f2937)]
          bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.96),#020617_85%)]
          px-6 py-8 sm:px-10 sm:py-10
          shadow-[0_24px_60px_rgba(0,0,0,0.9)]
          backdrop-blur-2xl
        "
      >
        {/* inner glow */}
        <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/5" />

        <div className="relative z-10 space-y-8">
          {/* Header */}
          <div className="text-center space-y-3">
            <p
              className="inline-flex items-center rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-300"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Shop Boost Setup
            </p>

            <h2 className="text-2xl font-semibold text-neutral-50 sm:text-3xl">
              From blank system to shop-ready in three steps.
            </h2>

            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-neutral-300 sm:text-base">
              Instead of spending weeks configuring software, ProFixIQ reads the
              way your shop already works and builds around it. Answer a few
              questions, upload your data, and let the AI return a working shop
              and fleet OS.
            </p>
          </div>

          {/* 3-step grid */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Step 1 */}
            <div className="flex flex-col gap-2 rounded-2xl bg-black/40 p-4 text-left">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: "rgba(248,113,22,0.16)",
                    color: COPPER,
                    border: "1px solid rgba(248,113,22,0.5)",
                  }}
                >
                  1
                </span>
                Quick profile
              </div>
              <h3 className="text-sm font-semibold text-neutral-50">
                Answer 5–10 yes/no questions.
              </h3>
              <p className="text-xs leading-relaxed text-neutral-300">
                Tell us if you have customers, repair history, parts inventory,
                fleets, and how many bays and techs you run. We use this to
                tailor the experience to a diesel shop, mixed fleet, or busy
                general repair.
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col gap-2 rounded-2xl bg-black/40 p-4 text-left">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: "rgba(248,113,22,0.16)",
                    color: COPPER,
                    border: "1px solid rgba(248,113,22,0.5)",
                  }}
                >
                  2
                </span>
                Upload your world
              </div>
              <h3 className="text-sm font-semibold text-neutral-50">
                Drag in customers, vehicles & parts.
              </h3>
              <p className="text-xs leading-relaxed text-neutral-300">
                Import CSVs or exports from your old system. ProFixIQ parses
                customers, vehicles, repair orders, and inventory and queues
                them into a clean, unified record ready for inspections and work
                orders.
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col gap-2 rounded-2xl bg-black/40 p-4 text-left">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: "rgba(248,113,22,0.16)",
                    color: COPPER,
                    border: "1px solid rgba(248,113,22,0.5)",
                  }}
                >
                  3
                </span>
                AI builds your blueprint
              </div>
              <h3 className="text-sm font-semibold text-neutral-50">
                Get a live shop and fleet playbook.
              </h3>
              <p className="text-xs leading-relaxed text-neutral-300">
                ProFixIQ surfaces your most common repairs, pre-builds service
                menus and inspections, and highlights missed opportunities so
                you can start writing smarter work orders on day one.
              </p>
            </div>
          </div>

          {/* AI report + add-ons row */}
          <div className="flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-start sm:justify-between">
            {/* AI report summary */}
            <div className="max-w-md text-left text-xs text-neutral-300 sm:text-sm">
              <h4 className="mb-1 text-sm font-semibold text-neutral-50">
                Instant “Holy Sh*t” moment for owners.
              </h4>
              <p className="leading-relaxed">
                As soon as imports finish, you get a Shop Health snapshot:
                top repairs, comeback risks, average RO, and fleet downtime
                indicators. It feels less like new software and more like a
                diagnostic scan for your business.
              </p>
            </div>

            {/* Add-ons mini grid */}
            <div className="grid w-full max-w-sm gap-2 text-[11px] text-neutral-300 sm:text-xs">
              <p className="mb-1 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                Power add-ons you can toggle on later
              </p>
              <div className="flex flex-wrap justify-end gap-1.5">
                <span
                  className="rounded-full border border-white/12 bg-black/40 px-3 py-1"
                  style={{ boxShadow: "0 0 18px rgba(15,23,42,0.85)" }}
                >
                  AI voice & dictation
                </span>
                <span className="rounded-full border border-white/12 bg-black/40 px-3 py-1">
                  Fleet portal & pre-trips
                </span>
                <span className="rounded-full border border-white/12 bg-black/40 px-3 py-1">
                  Parts & inventory sync
                </span>
                <span className="rounded-full border border-white/12 bg-black/40 px-3 py-1">
                  Accounting & payments
                </span>
                <span className="rounded-full border border-white/12 bg-black/40 px-3 py-1">
                  AI smart suggestions
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}