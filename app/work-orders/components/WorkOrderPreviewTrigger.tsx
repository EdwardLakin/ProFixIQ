"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode; // preview content
};

export function WorkOrderPreviewTrigger({ open, onOpenChange, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) { try { dlg.showModal(); } catch {} }
    else if (!open && dlg.open) { dlg.close(); }
  }, [open]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const onClick = (e: MouseEvent) => {
      const rect = dlg.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) onOpenChange?.(false);
    };
    dlg.addEventListener("click", onClick);
    return () => dlg.removeEventListener("click", onClick);
  }, [onOpenChange]);

  return (
    <dialog
      ref={dialogRef}
      onClose={() => onOpenChange?.(false)}
      className="backdrop:bg-black/60 rounded-lg border shadow-xl"
      style={{
        borderColor: "#f97316",        // orange border
        backgroundColor: "#0a0a0a",    // neutral-950
        maxWidth: "48rem",
        width: "calc(100% - 2rem)",
        margin: "auto",
      }}
    >
      <div className="p-5 border-b" style={{ borderColor: "rgb(38 38 38)" }}>
        <h2 className="text-2xl text-orange-400" style={{ fontFamily: "'Black Ops One', system-ui, sans-serif" }}>
          Work Order Preview
        </h2>
      </div>

      <div className="p-5 overflow-y-auto max-h-[70vh]" style={{ fontFamily: "'Roboto', system-ui, sans-serif" }}>
        {children}
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