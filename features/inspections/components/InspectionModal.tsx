"use client";

import React, { useMemo, useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";
import InspectionHost from "@/features/inspections/components/inspectionHost";

type Props = {
  open: boolean;
  src: string | null;
  title?: string;
  onClose?: () => void;
};

function paramsToObject(sp: URLSearchParams) {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => { out[k] = v; });
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
      const idx = parts.findIndex(p => p === "inspection" || p === "inspections");
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
      footerLeft={
        <div className="relative z-[2] flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCompact(v => !v)}
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
        <div className="mx-auto w-full max-w-3xl">
          {derived.missingWOLine && (
            <div className="mb-2 rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-xs text-yellow-200">
              <strong>Heads up:</strong> <code>workOrderLineId</code> is missing from the inspection URL.
              Save/Finish actions that require it may be blocked.
            </div>
          )}

          {/* Fixed-height viewport */}
          <div
            className={[
              "relative overflow-hidden rounded border border-neutral-800 bg-neutral-900",
              compact ? "h-[56vh]" : "h-[70vh]",
            ].join(" ")}
          >
            {/* Absolutely-positioned scroller fills the viewport */}
            <div
              className="absolute inset-0 overflow-y-auto p-0"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <InspectionHost template={derived.template!} embed params={derived.params} />
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}