// features/shared/components/InspectionModal.tsx
"use client";

import { useMemo } from "react";
import ModalShell from "@/features/shared/components/ModalShell";
import InspectionHost from "@/features/inspections/components/inspectionHost";

type Props = {
  open: boolean;            // unchanged
  src: string | null;       // e.g. /inspection/maintenance50?workOrderId=...&workOrderLineId=...
  title?: string;
  onClose?: () => void;     // optional escape hatch to close from parent
};

// Helper: convert URLSearchParams -> plain object
function paramsToObject(sp: URLSearchParams) {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => { out[k] = v; });
  return out;
}

export default function InspectionModal({ open, src, title = "Inspection", onClose }: Props) {
  // Derive a template slug and params from the provided `src`
  const derived = useMemo(() => {
    if (!src) return { template: null as string | null, params: {}, missingWOLine: false };

    try {
      const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
      const url = new URL(src, base);

      // Path shape examples:
      //   /inspection/maintenance50
      //   /inspection/custom:123
      //   /inspections/maintenance50        (tolerate plural too)
      const parts = url.pathname.split("/").filter(Boolean);
      // find the segment after "inspection" or "inspections"
      const idx = parts.findIndex(p => p === "inspection" || p === "inspections");
      const template = idx >= 0 ? parts[idx + 1] : parts[parts.length - 1];

      // Collect all query params (workOrderId, workOrderLineId, etc.)
      const params = paramsToObject(url.searchParams);

      const missingWOLine = !url.searchParams.get("workOrderLineId");

      return { template, params, missingWOLine };
    } catch {
      // Fallback: treat whole src as a template slug (unlikely but safe)
      return { template: src.replace(/^\//, ""), params: {}, missingWOLine: false };
    }
  }, [src]);

  const close = () => {
    if (onClose) onClose();
    // keep existing behavior for legacy listeners
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("inspection:close"));
    }
  };

  return (
    <ModalShell
      isOpen={open}
      onClose={close}
      size="lg"
      title={title}
      footerLeft={
        <button
          type="button"
          onClick={close}
          className="font-header rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs hover:bg-neutral-800"
          title="Minimize"
        >
          Minimize
        </button>
      }
      submitText={undefined}
      onSubmit={undefined}
    >
      {!derived.template ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-center text-neutral-400">
          No inspection selected.
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-2">
          {derived.missingWOLine && (
            <div className="w-full max-w-5xl rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-xs text-yellow-200">
              <strong>Heads up:</strong> <code>workOrderLineId</code> is missing from the inspection URL.
              Save/Finish actions that require it may be blocked.
            </div>
          )}
          <div className="w-full max-w-5xl">
            {/* embed prop => compact spacing / hides app chrome inside the screen */}
            <InspectionHost template={derived.template!} params={derived.params} embed />
          </div>
        </div>
      )}
    </ModalShell>
  );
}