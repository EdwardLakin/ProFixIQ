import Link from "next/link";

export function ShopBoostAnalysisUnavailable() {
  return (
    <div className="grid min-h-screen place-items-center bg-[color:var(--theme-surface-page)] px-4 text-[color:var(--theme-text-primary)]">
      <div className="max-w-md rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-5 text-center">
        <p className="text-lg font-semibold">Analysis unavailable</p>
        <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
          This analysis link is invalid or has expired. Start a new Instant Shop
          Analysis or ask the sender for a fresh link.
        </p>
        <Link
          href="/demo/instant-shop-analysis"
          className="mt-4 inline-flex rounded-md border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs"
        >
          Start a new analysis
        </Link>
      </div>
    </div>
  );
}
