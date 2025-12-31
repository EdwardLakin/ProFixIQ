"use client";

export default function FleetUnitsPage() {
  const card =
    "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
    "bg-black/70 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl";

  return (
    <div className="px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
        />

        <div className={card + " relative overflow-hidden px-4 py-4 md:px-6 md:py-5"}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-10 h-24 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.22),transparent_65%)]"
          />
          <div className="relative">
            <h1
              className="text-xl font-bold tracking-[0.22em] text-[rgba(248,113,22,0.9)] md:text-2xl uppercase"
              style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
            >
              Fleet Units
            </h1>
            <p className="mt-1 text-xs text-neutral-300">
              Master list of tractors, trailers, buses and other HD assets.
            </p>
          </div>
        </div>

        <div className={card + " px-4 py-4 md:px-6 md:py-5"}>
          <p className="text-xs text-neutral-300">
            Route <code className="text-[0.7rem] text-neutral-400">/fleet/units</code> is now live.
            The next step is to hook this page up to the fleet units table and asset detail screens.
          </p>
        </div>
      </div>
    </div>
  );
}
