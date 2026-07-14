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
        "inline-flex items-center rounded-full border px-2.5 py-1",
        "border-[color:var(--desktop-border,var(--theme-card-border,var(--theme-border-soft)))]",
        "bg-[color:var(--theme-surface-inset)]",
        "text-[10px] font-semibold uppercase tracking-[0.16em]",
        "text-[var(--theme-text-secondary,var(--theme-text-primary))]",
        className,
      )}
    >
      {children}
    </span>
  );
}
