"use client";

const COPPER = "var(--pfq-copper)";

type Step = {
  n: string;
  title: string;
  headline: string;
  body: string;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Profile",
    headline: "Answer 5–10 quick questions.",
    body: "Tell ProFixIQ what you run (fleet, mixed, diesel, automotive), how many bays/techs, and what data you have. We tailor the system to your real workflow — not generic templates.",
  },
  {
    n: "02",
    title: "Upload",
    headline: "Drag in customers, units, parts, history.",
    body: "Import CSVs or exports from your old system. We normalize customers, vehicles, repair orders, and inventory into one clean record that’s ready for inspections and work orders.",
  },
  {
    n: "03",
    title: "Blueprint",
    headline: "AI builds your shop operating plan.",
    body: "ProFixIQ surfaces your top repairs, builds starter menus and inspections, and highlights missed packages — so you can start writing smarter work orders on day one.",
  },
];

export default function LandingShopBoost() {
  return (
    <section className="relative mx-auto max-w-7xl px-4 pb-20 pt-6 sm:pb-28 sm:pt-10">
      {/* subtle “steel rail” */}
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative">
        {/* Header */}
        <div className="mx-auto max-w-4xl text-center">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-300"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: COPPER }}
            />
            Shop Boost Setup
          </div>

          <h2
            className="mt-4 text-3xl text-neutral-50 sm:text-4xl"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            From blank system to shop-ready in three moves.
          </h2>

          <p className="mx-auto mt-4 max-w-3xl text-sm leading-relaxed text-neutral-300 sm:text-base">
            Don’t spend weeks configuring software. ProFixIQ reads how your shop
            already works and builds around it — inspections, menus, automation,
            and portals that match fleet reality.
          </p>
        </div>

        {/* Timeline rail */}
        <div className="relative mx-auto mt-10 max-w-6xl">
          <div className="pointer-events-none absolute left-0 right-0 top-6 hidden h-px bg-white/10 sm:block" />

          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className={[
                  "relative overflow-hidden rounded-3xl border border-white/10",
                  "bg-black/25 backdrop-blur-xl",
                  "shadow-[0_28px_90px_rgba(0,0,0,0.70)]",
                ].join(" ")}
              >
                {/* copper signal */}
                <div
                  className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full blur-3xl opacity-60"
                  style={{ backgroundColor: "rgba(197,122,74,0.22)" }}
                />

                <div className="relative p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="grid h-11 w-11 place-items-center rounded-2xl border"
                        style={{
                          borderColor: "rgba(255,255,255,0.12)",
                          background:
                            "linear-gradient(145deg, rgba(197,122,74,0.18), rgba(0,0,0,0.25))",
                          boxShadow:
                            "0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 26px rgba(197,122,74,0.18)",
                        }}
                      >
                        <span
                          className="text-sm font-extrabold"
                          style={{ color: "var(--accent-copper-light)" }}
                        >
                          {s.n}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
                          {s.title}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-neutral-50">
                          {s.headline}
                        </div>
                      </div>
                    </div>

                    {/* timeline node */}
                    <div className="hidden sm:flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: COPPER }}
                      />
                      <span className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
                        armed
                      </span>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-neutral-300">
                    {s.body}
                  </p>

                  <div className="mt-5 flex items-center gap-2">
                    <div
                      className="h-[2px] w-10 rounded-full"
                      style={{ backgroundColor: COPPER }}
                    />
                    <div className="h-px flex-1 bg-white/5" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Owner “holy sh*t” block + add-ons */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-6 backdrop-blur-xl shadow-[0_28px_90px_rgba(0,0,0,0.60)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
                What you get immediately
              </div>
              <h3 className="mt-2 text-lg font-semibold text-neutral-50">
                Instant owner snapshot (the “holy sh*t” moment).
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-neutral-300">
                As soon as imports finish, you get a Shop Health Snapshot:
                top repairs, comeback risks, average RO, and fleet downtime signals —
                less like “new software”, more like a diagnostic scan for your business.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-6 backdrop-blur-xl shadow-[0_28px_90px_rgba(0,0,0,0.60)]">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
                  Power add-ons (toggle later)
                </div>
                <span
                  className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-neutral-300"
                  style={{ fontFamily: "var(--font-blackops)" }}
                >
                  Optional
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-neutral-200">
                {[
                  "AI voice & dictation",
                  "Fleet portal & pre-trips",
                  "Parts & inventory sync",
                  "Accounting & payments",
                  "AI smart suggestions",
                ].map((x) => (
                  <span
                    key={x}
                    className="rounded-full border border-white/12 bg-black/35 px-3 py-1"
                    style={{
                      boxShadow: "0 0 18px rgba(15,23,42,0.75)",
                    }}
                  >
                    {x}
                  </span>
                ))}
              </div>

              <p className="mt-4 text-xs text-neutral-400">
                Everything core ships in the workflow. Add-ons expand capability, not complexity.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}