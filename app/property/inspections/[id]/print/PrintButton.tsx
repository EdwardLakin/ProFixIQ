"use client";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded border border-neutral-300 px-3 py-1 text-sm text-neutral-800 hover:bg-neutral-100 print:hidden">
      Print
    </button>
  );
}
