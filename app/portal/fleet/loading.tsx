export default function FleetRouteLoading() {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-live="polite"
      aria-label="Loading Fleet workspace"
    >
      <span className="sr-only">Loading Fleet workspace…</span>
      <div className="h-1 w-full overflow-hidden rounded-full bg-sky-400/10">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-400" />
      </div>
      <div className="animate-pulse rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
        <div className="h-3 w-28 rounded bg-sky-400/20" />
        <div className="mt-3 h-7 w-2/3 max-w-md rounded bg-[color:var(--theme-surface-subtle)]" />
        <div className="mt-3 h-4 w-full max-w-2xl rounded bg-[color:var(--theme-surface-subtle)]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
          />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
        <div className="h-80 animate-pulse rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]" />
        <div className="h-80 animate-pulse rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]" />
      </div>
    </div>
  );
}
