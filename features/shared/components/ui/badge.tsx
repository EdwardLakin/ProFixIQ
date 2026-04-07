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
        "border-[var(--theme-card-border,#334155)]",
        "bg-[var(--theme-surface-2,#0B1220)]",
        "text-[10px] font-semibold uppercase tracking-[0.16em]",
        "text-[var(--theme-text-primary,#FFFFFF)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
