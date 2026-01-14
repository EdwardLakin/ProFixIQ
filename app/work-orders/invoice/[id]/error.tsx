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
    <div className="min-h-screen bg-black px-4 py-6 text-neutral-100">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-black/50 p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-amber-300">
          Invoice route crashed
        </div>

        <div className="mt-2 text-lg font-semibold">Runtime error</div>

        <div className="mt-2 rounded-xl border border-white/10 bg-black/60 p-3">
          <div className="text-[12px] text-neutral-300">Message</div>
          <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-white">
            {error?.message ?? "Unknown error"}
          </pre>

          <div className="mt-3 text-[12px] text-neutral-300">Digest</div>
          <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-white">
            {error?.digest ?? "—"}
          </pre>

          <div className="mt-3 text-[12px] text-neutral-300">Stack</div>
          <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-neutral-200">
            {error?.stack ?? "No stack available"}
          </pre>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => reset()}
            className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          >
            Go dashboard
          </a>
        </div>
      </div>
    </div>
  );
}