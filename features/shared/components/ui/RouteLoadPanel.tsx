"use client";

import type { RouteLoadFailure } from "@/features/shared/lib/route-load";

function titleForFailure(failure: RouteLoadFailure): string {
  switch (failure.kind) {
    case "unauthenticated":
      return "Sign in required";
    case "forbidden":
      return "Access denied";
    case "not-found":
      return "Record not found";
    case "timeout":
      return "Still waiting for data";
    default:
      return "Unable to load this screen";
  }
}

export default function RouteLoadPanel({
  failure,
  onRetry,
  title,
}: {
  failure: RouteLoadFailure;
  onRetry?: () => void;
  title?: string;
}): JSX.Element {
  return (
    <section
      aria-live="polite"
      className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-red-100"
      role="alert"
    >
      <h2 className="text-sm font-semibold">
        {title ?? titleForFailure(failure)}
      </h2>
      <p className="mt-1 text-xs text-red-100/90">{failure.message}</p>
      {failure.requestId ? (
        <p className="mt-2 text-[0.7rem] text-red-100/70">
          Reference: <span className="font-mono">{failure.requestId}</span>
        </p>
      ) : null}
      {failure.retryable && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full border border-red-300/50 bg-[color:var(--theme-surface-inset)] px-4 py-2 text-xs font-semibold text-red-100 transition hover:bg-[color:var(--theme-surface-overlay)]"
        >
          Try again
        </button>
      ) : null}
    </section>
  );
}
