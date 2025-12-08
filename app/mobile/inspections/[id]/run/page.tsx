// app/mobile/inspections/[id]/run/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import type { JSX } from "react";

function MobileInspectionPlaceholder({ id }: { id: string }): JSX.Element {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-neutral-200 shadow-[0_18px_45px_rgba(0,0,0,0.85)]">
      <p className="mb-2 font-semibold">Mobile inspection runner</p>
      <p className="text-xs text-neutral-400">
        This route is ready for the dedicated mobile inspection runner for
        work-order line:
        <span className="font-mono text-neutral-100"> {id}</span>.
        <br />
        In the inspection-modal thread we’ll mount the real inspection
        component here so techs can run inspections (corner grids, voice, etc.)
        without loading the full desktop app shell.
      </p>
    </div>
  );
}

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

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl flex-col bg-transparent px-3 py-4 text-white">
      {/* Header bar – consistent with other mobile pages */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] text-neutral-100 hover:bg-black/70"
        >
          <span>←</span>
          <span className="uppercase tracking-[0.16em]">Back</span>
        </button>

        <div className="flex-1 px-2 text-center">
          <h1 className="truncate text-xs font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Run Inspection
          </h1>
        </div>

        {/* Right side left intentionally minimal for now */}
        <div className="w-16" />
      </div>

      {/* Body – real mobile inspection runner will mount here */}
      <div className="flex-1">
        <MobileInspectionPlaceholder id={String(id)} />
      </div>
    </main>
  );
}