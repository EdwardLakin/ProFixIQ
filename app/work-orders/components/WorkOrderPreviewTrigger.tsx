// app/work-orders/components/WorkOrderPreviewTrigger.tsx
"use client";

import { useEffect, useRef } from "react";

type Props = {
  woId: string | null;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function WorkOrderPreviewTrigger({ woId, open, onOpenChange }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // Open/close sync
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      try { dlg.showModal(); } catch {}
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  // Close on backdrop click
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const onClick = (e: MouseEvent) => {
      const rect = dlg.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inside) onOpenChange?.(false);
    };
    dlg.addEventListener("click", onClick);
    return () => dlg.removeEventListener("click", onClick);
  }, [onOpenChange]);

  // Build iframe src only when we have an id
  const src = woId ? `/work-orders/preview/${encodeURIComponent(woId)}` : undefined;

  return (
    <dialog
      ref={dialogRef}
      onClose={() => onOpenChange?.(false)}
      className="backdrop:bg-black/60 rounded-lg border shadow-xl"
      style={{
        borderColor: "#f97316",           // orange border
        backgroundColor: "#0a0a0a",       // dark neutral bg
        maxWidth: "48rem",
        width: "calc(100% - 2rem)",
        margin: "auto",
      }}
    >
      <div className="p-5 border-b" style={{ borderColor: "rgb(38 38 38)" }}>
        <h2
          className="text-2xl text-orange-400"
          style={{ fontFamily: "'Black Ops One', system-ui, sans-serif" }}
        >
          Work Order Preview
        </h2>
      </div>

      <div className="p-0">
        {src ? (
          <iframe
            key={src}           // force refresh when woId changes
            src={src}
            title="Work Order Preview"
            style={{
              display: "block",
              width: "100%",
              height: "70vh",
              border: "0",
              background: "#0a0a0a",
              borderBottom: "1px solid rgb(38 38 38)",
            }}
          />
        ) : (
          <div
            className="p-5 text-sm text-neutral-400"
            style={{ fontFamily: "'Roboto', system-ui, sans-serif" }}
          >
            No work order id provided yet.
          </div>
        )}
      </div>

      <div className="p-4 border-t flex justify-end" style={{ borderColor: "rgb(38 38 38)" }}>
        <button
          onClick={() => onOpenChange?.(false)}
          className="px-3 py-2 text-sm font-semibold rounded border"
          style={{
            borderColor: "#f97316",
            backgroundColor: "#ea580c",
            color: "white",
            fontFamily: "'Black Ops One', system-ui, sans-serif",
          }}
        >
          Close
        </button>
      </div>
    </dialog>
  );
}