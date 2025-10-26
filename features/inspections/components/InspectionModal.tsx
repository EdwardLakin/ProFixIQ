"use client";

import { useEffect, useMemo } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

type Props = {
  open: boolean;           // simple boolean; no onClose prop to avoid serialization issues
  src: string | null;      // inspection page path (e.g. /inspections/maintenance50?workOrderId=...)
  title?: string;
};

export default function InspectionModal({ open, src, title = "Inspection" }: Props) {
  // Build iframe src in the client and force bare/compact embed flags
  const iframeSrc = useMemo(() => {
    if (!src) return null;
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const u = new URL(src, base);
      u.searchParams.set("embed", "1");   // <- bare embed mode (no chrome)
      u.searchParams.set("compact", "1"); // keep tight spacing inside iframe
      return u.toString();
    } catch {
      return src;
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
        <div className="flex items-center justify-center">
          <iframe
            key={iframeSrc}
            src={iframeSrc}
            className="h-[75vh] w-full max-w-5xl rounded border border-neutral-800"
          />
        </div>
      )}
    </ModalShell>
  );
}