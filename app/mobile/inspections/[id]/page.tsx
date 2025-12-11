// app/mobile/inspections/[id]/page.tsx
"use client";

import { useParams, useSearchParams } from "next/navigation";
import type { JSX } from "react";

import GenericInspectionScreen from "@/features/inspections/screens/GenericInspectionScreen";
import PreviousPageButton from "@shared/components/ui/PreviousPageButton";

export default function MobileInspectionRunnerPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();

  const lineId = params?.id;
  const workOrderId = search.get("workOrderId");
  const templateId = search.get("templateId");

  if (!lineId) {
    return (
      <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-3 py-4 text-sm text-red-300">
        Missing inspection id.
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl flex-col bg-transparent px-3 py-4 text-white">
      {/* Simple mobile header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <PreviousPageButton />
        <div className="text-right">
          <p className="text-[0.65rem] uppercase tracking-[0.22em] text-neutral-500">
            Mobile inspection
          </p>
          <p className="mt-0.5 text-[0.7rem] text-neutral-400">
            Line{" "}
            <span className="font-mono text-[10px] text-neutral-200">
              {lineId}
            </span>
          </p>
          {workOrderId && (
            <p className="text-[0.65rem] text-neutral-500">
              WO:{" "}
              <span className="font-mono">
                {workOrderId.slice(0, 8)}
              </span>
            </p>
          )}
          {templateId && (
            <p className="text-[0.65rem] text-neutral-500">
              Template:{" "}
              <span className="font-mono">{templateId}</span>
            </p>
          )}
        </div>
      </div>

      {/* Dedicated mobile inspection layout, powered by GenericInspectionScreen */}
      <div className="rounded-2xl border border-white/10 bg-black/40 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-md">
        <GenericInspectionScreen />
      </div>
    </main>
  );
}