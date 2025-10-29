// features/shared/components/InspectionModal.tsx
"use client";

import { useEffect, useMemo } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

type Props = {
  open: boolean;           // simple boolean; no onClose prop to avoid serialization issues
  src: string | null;      // full inspection page path, e.g. /inspections/maintenance50?workOrderId=...&workOrderLineId=...
  title?: string;
};

export default function InspectionModal({ open, src, title = "Inspection" }: Props) {
  // Build iframe src in the client and force bare/compact embed flags
  const { iframeSrc, missingWorkOrderLineId } = useMemo(() => {
    if (!src) return { iframeSrc: null as string | null, missingWorkOrderLineId: false };
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const u = new URL(src, base);

      // Add the embed flags but preserve all original params (including workOrderLineId/workOrderId/etc.)
      u.searchParams.set("embed", "1");   // <- bare embed mode (no chrome)
      u.searchParams.set("compact", "1"); // <- tight spacing inside iframe

      const hasWOLine = !!u.searchParams.get("workOrderLineId");
      return { iframeSrc: u.toString(), missingWorkOrderLineId: !hasWOLine };
    } catch {
      // Fallback: we can’t safely manipulate URL; still attempt to render what we were given.
      return { iframeSrc: src, missingWorkOrderLineId: false };
    }
  }, [src]);

  // Listen for messages from inside iframe to close/minimize
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (typeof window === "undefined") return;
      if (e.origin !== window.location.origin) return;

      if (e.data?.type === "inspection:close" || e.data?.type === "inspection:minimize") {
        window.dispatchEvent(new CustomEvent("inspection:close"));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <ModalShell
      isOpen={open}
      onClose={() => window.dispatchEvent(new CustomEvent("inspection:close"))}
      size="lg"
      title={title}
      footerLeft={
        <button
          type="button"
          onClick={() =>
            window.postMessage({ type: "inspection:close" }, window.location.origin)
          }
          className="font-header rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs hover:bg-neutral-800"
          title="Minimize"
        >
          Minimize
        </button>
      }
      submitText={undefined}
      onSubmit={undefined}
    >
      {!iframeSrc ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-center text-neutral-400">
          No inspection selected.
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-2">
          {missingWorkOrderLineId && (
            <div className="w-full max-w-5xl rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-xs text-yellow-200">
              <strong>Heads up:</strong> <code>workOrderLineId</code> is missing from the inspection URL.
              Save/Finish actions that require it may be blocked.
            </div>
          )}
          <iframe
            key={iframeSrc}
            src={iframeSrc}
            // allow mic (for voice/recognition), plus clipboard QoL if needed
            allow="microphone; clipboard-read; clipboard-write"
            className="h-[75vh] w-full max-w-5xl rounded border border-neutral-800"
            // helpful for accessibility & testing
            title={title}
            data-testid="inspection-iframe"
          />
        </div>
      )}
    </ModalShell>
  );
}