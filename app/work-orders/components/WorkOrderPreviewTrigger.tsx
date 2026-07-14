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
      className="backdrop:bg-[color:var(--theme-surface-overlay)] rounded-lg border shadow-xl"
      style={{
        borderColor: "var(--accent-copper, #f97316)",
        backgroundColor: "var(--theme-card-bg, var(--theme-surface-page))",
        maxWidth: "48rem",
        width: "calc(100% - 2rem)",
        margin: "auto",
      }}
    >
      <div className="p-5 border-b border-[var(--theme-card-border)]">
        <h2
          className="text-2xl text-[var(--accent-copper-light)]"
          style={{ fontFamily: "'Black Ops One', system-ui, sans-serif" }}
        >
          Work Order Preview
        </h2>
      </div>

      <div className="p-5 overflow-y-auto max-h-[70vh]" style={{ fontFamily: "'Roboto', system-ui, sans-serif" }}>
        {children}
      </div>

      <div className="p-4 border-t border-[var(--theme-card-border)] flex justify-end">
        <button
          onClick={() => onOpenChange?.(false)}
          className="px-3 py-2 text-sm font-semibold rounded border"
          style={{
            borderColor: "var(--accent-copper, #f97316)",
            backgroundColor: "var(--accent-copper, #f97316)",
            color: "var(--theme-button-primary-text, #000)",
            fontFamily: "'Black Ops One', system-ui, sans-serif",
          }}
        >
          Close
        </button>
      </div>
    </dialog>
  );
}
