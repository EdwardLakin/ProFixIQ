// app/work-orders/invoice/[id]/error.tsx
"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // This will show in Vercel logs too
    console.error("[invoice route error]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[color:var(--theme-surface-page)] px-4 py-6 text-[color:var(--theme-text-primary)]">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-amber-300">
          Invoice route crashed
        </div>

        <div className="mt-2 text-lg font-semibold">Runtime error</div>

        <div className="mt-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-3">
          <div className="text-[12px] text-[color:var(--theme-text-secondary)]">Message</div>
          <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-[color:var(--theme-text-primary)]">
            {error?.message ?? "Unknown error"}
          </pre>

          <div className="mt-3 text-[12px] text-[color:var(--theme-text-secondary)]">Digest</div>
          <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-[color:var(--theme-text-primary)]">
            {error?.digest ?? "—"}
          </pre>

          <div className="mt-3 text-[12px] text-[color:var(--theme-text-secondary)]">Stack</div>
          <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-[color:var(--theme-text-primary)]">
            {error?.stack ?? "No stack available"}
          </pre>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => reset()}
            className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-2 text-sm hover:bg-[color:var(--theme-surface-subtle)]"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-2 text-sm hover:bg-[color:var(--theme-surface-subtle)]"
          >
            Go dashboard
          </a>
        </div>
      </div>
    </div>
  );
}