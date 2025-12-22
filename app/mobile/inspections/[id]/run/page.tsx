// app/mobile/inspections/[id]/run/page.tsx
"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { JSX } from "react";

function MobileInspectionRunnerFrame({
  lineId,
  templateId,
  workOrderId,
}: {
  lineId: string;
  templateId: string;
  workOrderId?: string | null;
}): JSX.Element {
  const src = useMemo(() => {
    const sp = new URLSearchParams();

    // ✅ REQUIRED by /inspections/run loader
    sp.set("templateId", templateId);

    // ✅ Required for save/finish in WO context
    sp.set("workOrderLineId", lineId);
    if (workOrderId) sp.set("workOrderId", workOrderId);

    // ✅ UI mode flags
    sp.set("view", "mobile");
    sp.set("embed", "1");

    // ✅ Make local resume stable across reloads for this run
    // (so you don't generate a new uuid each time)
    sp.set("inspectionId", lineId);

    return `/inspections/run?${sp.toString()}`;
  }, [lineId, templateId, workOrderId]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
            Inspection runner
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            Line{" "}
            <span className="font-mono text-[10px] text-neutral-200">{lineId}</span>
            {workOrderId ? (
              <>
                {" "}
                • WO{" "}
                <span className="font-mono text-[10px] text-neutral-200">
                  {workOrderId}
                </span>
              </>
            ) : null}
          </p>
        </div>

        <span className="inline-flex items-center rounded-full border border-sky-400/80 bg-sky-500/15 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-sky-100 shadow-[0_0_16px_rgba(56,189,248,0.55)]">
          Corner grids
        </span>
      </div>

      <div className="mt-2 h-[calc(100vh-9rem)] overflow-hidden rounded-xl border border-white/8 bg-black/90">
        <iframe src={src} title="Mobile inspection runner" className="h-full w-full border-0" />
      </div>
    </div>
  );
}

export default function MobileInspectionRunnerRunPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();

  const lineId = params?.id ? String(params.id) : null;
  const templateId = sp.get("templateId");
  const workOrderId = sp.get("workOrderId");

  if (!lineId) {
    return (
      <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-3 py-4 text-sm text-red-300">
        Missing work order line id.
      </main>
    );
  }

  if (!templateId) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl flex-col px-3 py-6 text-white">
        <div className="rounded-xl border border-yellow-700 bg-yellow-900/20 p-4 text-sm text-yellow-200">
          <div className="font-semibold">Missing templateId</div>
          <div className="mt-1 text-xs text-yellow-100/90">
            Open this page with <code className="font-mono">?templateId=&lt;id&gt;</code>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl flex-col bg-transparent px-3 py-4 text-white">
      <div className="space-y-4">
        <MobileInspectionRunnerFrame
          lineId={lineId}
          templateId={templateId}
          workOrderId={workOrderId}
        />
      </div>
    </main>
  );
}