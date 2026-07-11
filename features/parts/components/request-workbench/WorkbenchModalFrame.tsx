"use client";

import React, { type ReactNode } from "react";

export function WorkbenchModalFrame({
  open,
  eyebrow = "Parts Workbench",
  title,
  children,
  footer,
  onClose,
}: {
  open: boolean;
  eyebrow?: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
}): JSX.Element | null {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[71] max-h-[calc(100vh-32px)] w-[min(760px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">{eyebrow}</div>
            <div className="mt-1 text-lg font-semibold text-white">{title}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/5">
            Close
          </button>
        </div>
        <div className="max-h-[calc(100vh-180px)] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-white/10 bg-white/[0.02] px-5 py-4">{footer}</div> : null}
      </div>
    </>
  );
}

export const modalInput =
  "w-full rounded-lg border border-white/10 bg-neutral-950/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30";

export const modalButton =
  "rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-white/5";

export const modalPrimaryButton =
  "rounded-lg border border-orange-500/35 bg-orange-600/85 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500";
