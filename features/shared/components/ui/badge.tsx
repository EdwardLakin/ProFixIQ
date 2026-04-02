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
        "inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1",
        "text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-100",
        className,
      )}
    >
      {children}
    </span>
  );
}
