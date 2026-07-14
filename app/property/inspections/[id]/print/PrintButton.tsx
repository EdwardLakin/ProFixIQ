"use client";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded border border-[color:var(--theme-border-soft)] px-3 py-1 text-sm text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)] print:hidden">
      Print
    </button>
  );
}
