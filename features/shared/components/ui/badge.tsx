"use client";

import { cn } from "@shared/lib/utils";

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2.5 py-1",
        "rounded-full border-[var(--theme-border-soft)]",
        "bg-[color:var(--theme-panel-bg-start)]",
        "text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-text-primary)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
