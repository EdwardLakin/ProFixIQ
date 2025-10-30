"use client";

import React, { useMemo, useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";
import InspectionHost from "@/features/inspections/components/inspectionHost";

type Props = {
  open: boolean;
  src: string | null;   // e.g. /inspection/maintenance50?workOrderId=...&workOrderLineId=...
  title?: string;
  onClose?: () => void;
};

// Helper: URLSearchParams -> plain object (string values are fine for screens)
function paramsToObject(sp: URLSearchParams) {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => { out[k] = v; });
  return out;
}

export default function InspectionModal({ open, src, title = "Inspection", onClose }: Props) {
  // Start compact so it’s smaller by default
  const [compact, setCompact] = useState(true);

  // Parse template + params from `src`
  const derived = useMemo(() => {
    if (!src) return { template: null as string | null, params: {}, missingWOLine: false };

    try {
      const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
      const url = new URL(src, base);

      // Accept /inspection/... or /inspections/...
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "inspection" || p === "inspections");
      const template = idx >= 0 ? parts[idx + 1] : parts[parts.length - 1];

      const params = paramsToObject(url.searchParams);
      const missingWOLine = !url.searchParams.get("workOrderLineId");

      return { template, params, missingWOLine };
    } catch {
      return { template: src.replace(/^\//, ""), params: {}, missingWOLine: false };
    }
  }, [src]);

  const close = () => {
    onClose?.();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("inspection:close"));
    }
  };

  return (
    <ModalShell
      isOpen={open}
      onClose={close}
      size="md"
      title={title}
      /* Keep footer always visible and above content */
      footerLeft={
        <div className="relative z-[2] flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCompact((v) => !v)}
            className="font-header rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs hover:bg-neutral-800"
            title={compact ? "Maximize" : "Minimize"}
          >
            {compact ? "Maximize" : "Minimize"}
          </button>
          <button
            type="button"
            onClick={close}
            className="font-header rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs hover:bg-neutral-800"
            title="Close"
          >
            Close
          </button>
        </div>
      }
      submitText={undefined}
      onSubmit={undefined}
    >
      {!derived.template ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-center text-neutral-400">
          No inspection selected.
        </div>
      ) : (
        /**
         * Layout notes:
         * - Outer wrapper uses overflow-hidden so nothing bleeds past the modal.
         * - Inner scroller (flex-1 overflow-y-auto) is the ONLY scrolling region.
         * - max-h clamps total body height (independent of header/footer).
         */
        <div
          className={[
            "mx-auto w-full max-w-3xl overflow-hidden",               // tighter width + prevent bleed
            compact ? "max-h-[56vh]" : "max-h-[70vh]",                // total body clamp
            "flex flex-col",                                          // establish a column layout
          ].join(" ")}
        >
          {derived.missingWOLine && (
            <div className="mb-2 shrink-0 rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-xs text-yellow-200">
              <strong>Heads up:</strong> <code>workOrderLineId</code> is missing from the inspection URL.
              Save/Finish actions that require it may be blocked.
            </div>
          )}

          {/* Scroll container */}
          <div className="min-h-0 flex-1 overflow-y-auto rounded border border-neutral-800 bg-neutral-900 p-0">
            {/* Pass embed for compact spacing; params are parsed but the host only uses template/embed */}
            <InspectionHost template={derived.template!} embed params={derived.params} />
          </div>
        </div>
      )}
    </ModalShell>
  );
}