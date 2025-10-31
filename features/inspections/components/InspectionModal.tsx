// features/inspections/components/InspectionModal.tsx (your “Current inspection modal” file)
"use client";

import React, { useMemo, useState } from "react";
import { Dialog } from "@headlessui/react";
import InspectionHost from "@/features/inspections/components/inspectionHost";

type Props = {
  open: boolean;
  src: string | null;
  title?: string;
  onClose?: () => void;
};

function paramsToObject(sp: URLSearchParams) {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => (out[k] = v));
  return out;
}

export default function InspectionModal({ open, src, title = "Inspection", onClose }: Props) {
  const [compact, setCompact] = useState(true);

  const derived = useMemo(() => {
    if (!src) return { template: null as string | null, params: {}, missingWOLine: false };
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
      const url = new URL(src, base);
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
    <Dialog
      open={open}
      onClose={close}
      className="fixed inset-0 z-[300] flex items-center justify-center"
    >
      <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      <div className="relative z-[310] mx-4 my-6 w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        {/* Title row (fixed above scroller) */}
        <div className="mb-2 flex items-start justify-between gap-3">
          <Dialog.Title className="text-lg font-header font-semibold tracking-wide text-white">
            {title}
          </Dialog.Title>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-800"
              title={compact ? "Maximize" : "Minimize"}
            >
              {compact ? "Maximize" : "Minimize"}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded border border-neutral-700 px-2 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* SCROLLER lives in ModalShell (via bodyClassName default). 
            If you aren't wrapping this with ModalShell, add the same classes here:
            max-h-[85vh] overflow-y-auto overscroll-contain, WebKit momentum. */}
        <div
          className="max-h-[85vh] overflow-y-auto overscroll-contain rounded-lg border border-orange-400 bg-neutral-950 p-4 text-white shadow-xl min-h-0"
          style={{ WebkitOverflowScrolling: "touch" as any, scrollbarGutter: "stable both-edges" }}
        >
          {derived.missingWOLine && (
            <div className="mb-3 rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-xs text-yellow-200">
              <strong>Heads up:</strong> <code>workOrderLineId</code> is missing; Save/Finish may be blocked.
            </div>
          )}

          {!derived.template ? (
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-center text-neutral-400">
              No inspection selected.
            </div>
          ) : (
            <div className="mx-auto w-full max-w-5xl min-h-0">
              <InspectionHost template={derived.template} embed params={derived.params} />
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs hover:bg-neutral-800"
            >
              {compact ? "Maximize" : "Minimize"}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:bg-neutral-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:bg-neutral-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}