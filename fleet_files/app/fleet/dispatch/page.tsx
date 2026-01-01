// app/fleet/dispatch/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function FleetDispatchPage() {
  const card =
    "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
    "bg-black/70 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl";

  return (
    <main className="min-h-[calc(100vh-3rem)] px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        {/* Copper wash from dashboard theme */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
        />

        {/* Header */}
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
              Dispatch Board
            </h1>
            <p className="mt-1 text-xs text-neutral-300">
              Assign units, drivers and routes. This is a placeholder shell wired to the
              correct route so we can layer in the full dispatch UI next.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className={card + " px-4 py-4 md:px-6 md:py-5"}>
          <p className="text-xs text-neutral-300">
            • Route:{" "}
            <code className="text-[0.7rem] text-neutral-400">
              /fleet/dispatch
            </code>{" "}
            is live and uses the normal dashboard chrome.
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            Next step will be to plug in the fleet dispatch components (units, drivers,
            schedule) and hook them to work orders / service requests.
          </p>
        </div>
      </div>
    </main>
  );
}