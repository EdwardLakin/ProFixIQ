// app/mobile/inspections/[id]/run/page.tsx
"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import type { JSX } from "react";

export default function MobileInspectionRunnerPage(): JSX.Element {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (!id) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-red-300">
        <p className="text-sm">Missing inspection id.</p>
      </main>
    );
  }

  // We re-use the existing inspection page, but in "mobile view" + embed mode.
  // The navigation *into* this route is always via /mobile/inspections/[id]/run.
  const src = `/inspections/${id}?view=mobile&embed=1`;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
        >
          ← Back
        </button>

        <div className="flex-1 px-2 text-center">
          <h1 className="truncate text-xs font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Run Inspection
          </h1>
        </div>

        <Link
          href={`/inspections/${id}`}
          className="rounded-full border border-[color:var(--accent-copper-soft)] bg-[color:var(--accent-copper-soft)] px-3 py-1 text-[0.7rem] font-semibold text-black hover:bg-[color:var(--accent-copper-light)]"
        >
          Desktop
        </Link>
      </header>

      {/* Runner */}
      <main className="flex-1 overflow-hidden">
        <iframe
          src={src}
          title="Inspection"
          className="block h-full w-full border-0 bg-black"
        />
      </main>
    </div>
  );
}