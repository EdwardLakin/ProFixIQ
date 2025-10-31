"use client";

import React, { useMemo, useState } from "react";
import { Dialog } from "@headlessui/react";
import InspectionHost from "@/features/inspections/components/inspectionHost";

/** Props */
type Props = {
  open: boolean;
  src: string | null;
  title?: string;
  onClose?: () => void;
};

/** URLSearchParams -> object */
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
      // keep this ABOVE FocusedJobModal (z-[100]/[110])
      className="fixed inset-0 z-[300] flex items-center justify-center"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel wrapper — SAME width as Focused Job modal */}
      <div className="relative z-[310] mx-4 my-6 w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        {/* Title row (outside scroller, stays put) */}
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

        {/* Scroll container — SAME height/scroll as Focused Job modal */}
        <div className="max-h-[75vh] overflow-y-auto rounded-lg border border-orange-400 bg-neutral-950 p-4 text-white shadow-xl">
          {/* Optional warning if WO line is missing */}
          {derived.missingWOLine && (
            <div className="mb-3 rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-xs text-yellow-200">
              <strong>Heads up:</strong> <code>workOrderLineId</code> is missing; Save/Finish may be
              blocked.
            </div>
          )}

          {!derived.template ? (
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-center text-neutral-400">
              No inspection selected.
            </div>
          ) : (
            <div
              className={[
                "mx-auto w-full",
                // give the screen a bit more breathing room on wide view
                "max-w-5xl",
                // internal height of the host is flexible; we keep the outer scroller
              ].join(" ")}
            >
              <InspectionHost template={derived.template} embed params={derived.params} />
            </div>
          )}

          {/* Footer (inside scroller so it’s visible on small screens too) */}
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