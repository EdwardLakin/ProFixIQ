"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[dashboard] error boundary:", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
        <div className="text-xs font-blackops uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">
          Dashboard error
        </div>

        <h1 className="mt-2 text-xl font-semibold text-[color:var(--theme-text-primary)]">
          Something went wrong while loading the dashboard.
        </h1>

        <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
          Try again. If it keeps happening, check the browser console / Vercel logs.
        </p>

        {/* Keep UI minimal: message + digest only, no stack */}
        <div className="mt-4 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <div className="text-[0.7rem] uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
            Error
          </div>
          <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
            {error?.message || "Unknown error"}
          </div>
          {error?.digest ? (
            <div className="mt-2 text-[0.7rem] text-[color:var(--theme-text-muted)]">
              Digest: <span className="font-mono">{error.digest}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-full border border-[var(--accent-copper-light)] bg-[var(--accent-copper)]/15 px-4 py-2 text-xs font-semibold text-[var(--accent-copper-light)] transition hover:bg-[var(--accent-copper)]/25"
          >
            Try again
          </button>

          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-2 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)]"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}