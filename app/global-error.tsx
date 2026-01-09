"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  useEffect(() => {
    // Keep details in logs (Vercel / console), not in UI
    // eslint-disable-next-line no-console
    console.error("[global-error] uncaught:", error);
  }, [error]);

  const message =
    typeof error?.message === "string" && error.message.trim().length > 0
      ? error.message
      : "Unknown error";

  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        <div className="mx-auto w-full max-w-2xl px-4 py-12">
          <div className="rounded-2xl border border-white/10 bg-black/35 p-6 shadow-[0_0_60px_rgba(0,0,0,0.85)] backdrop-blur-xl">
            <div className="text-xs font-blackops uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">
              System error
            </div>

            <h1 className="mt-2 text-xl font-semibold text-white">
              Something went wrong
            </h1>

            <p className="mt-2 text-sm text-white/70">
              Try again. If it keeps happening, check Vercel logs.
            </p>

            {/* ✅ NO STACK IN UI */}
            <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-3">
              <div className="text-[0.7rem] uppercase tracking-[0.14em] text-neutral-500">
                Error
              </div>
              <div className="mt-1 text-sm text-neutral-200">{message}</div>
              {error?.digest ? (
                <div className="mt-2 text-[0.7rem] text-neutral-500">
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
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-white/10"
              >
                Go home
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}