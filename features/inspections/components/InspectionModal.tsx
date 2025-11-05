// features/inspections/components/InspectionModal.tsx
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
      // important: allow the whole dialog to scroll if needed
      className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel wrapper so we can center + add margins */}
      <div className="relative z-[310] mx-4 my-6 w-full max-w-5xl">
        <Dialog.Panel
          // panel itself will scroll up to 85vh
          className="profix-inspection-modal flex max-h-[85vh] flex-col overflow-hidden rounded-lg border border-orange-400 bg-neutral-950 text-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* HEADER */}
          <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-4 py-3">
            <Dialog.Title className="text-lg font-header font-semibold tracking-wide text-white">
              {title}
            </Dialog.Title>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCompact((v) => !v)}
                className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-800"
              >
                {compact ? "Maximize" : "Minimize"}
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded border border-neutral-700 px-2 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                ✕
              </button>
            </div>
          </div>

          {/* BODY (this is the scroll area) */}
          <div
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3"
            style={{
              WebkitOverflowScrolling: "touch",
              scrollbarGutter: "stable both-edges",
            }}
          >
            {/* force hostile child layouts to behave */}
            <style
              dangerouslySetInnerHTML={{
                __html: `
                  .profix-inspection-modal :is(.h-screen, [class*="h-screen"]) {
                    height: auto !important;
                  }
                  .profix-inspection-modal :is(.min-h-screen, [class*="min-h-screen"]) {
                    min-height: 0 !important;
                  }
                  .profix-inspection-modal :is(.overflow-hidden, [class*="overflow-hidden"]) {
                    overflow: visible !important;
                  }
                  .profix-inspection-modal :is(.fixed, [class*="fixed"]) {
                    position: static !important;
                  }
                `,
              }}
            />

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
              // this wrapper keeps the host from growing past the modal
              <div className="min-h-0 max-h-[60vh] overflow-y-auto rounded-md bg-neutral-950/30">
                <InspectionHost template={derived.template} embed params={derived.params} />
              </div>
            )}
          </div>

          {/* FOOTER */}
          <div className="flex items-center justify-between gap-2 border-t border-neutral-800 px-4 py-3">
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
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}