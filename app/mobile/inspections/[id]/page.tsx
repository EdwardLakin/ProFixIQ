// app/mobile/inspections/[id]/page.tsx
"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import type { JSX } from "react";

function MobileInspectionFrame({ lineId }: { lineId: string }): JSX.Element {
  const src = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("workOrderLineId", lineId);
    sp.set("view", "mobile");
    sp.set("embed", "1");
    return `/inspections/run?${sp.toString()}`;
  }, [lineId]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-md">
      {/* Card header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
            Mobile inspection
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            Line{" "}
            <span className="font-mono text-[10px] text-neutral-200">
              {lineId}
            </span>
          </p>
        </div>

        <span className="inline-flex items-center rounded-full border border-[color:var(--accent-copper-soft)]/70 bg-black/40 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper-light)] shadow-[0_0_16px_rgba(248,113,22,0.55)]">
          Live
        </span>
      </div>

      {/* Runner frame */}
      <div className="mt-2 h-[calc(100vh-9rem)] overflow-hidden rounded-xl border border-white/8 bg-black/90">
        <iframe
          src={src}
          title="Mobile inspection runner"
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}

export default function MobileInspectionRunnerPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  if (!id) {
    return (
      <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-3 py-4 text-sm text-red-300">
        Missing inspection id.
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl flex-col bg-transparent px-3 py-4 text-white">
      <div className="space-y-4">
        <MobileInspectionFrame lineId={String(id)} />
      </div>
    </main>
  );
}