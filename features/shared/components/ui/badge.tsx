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
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        className
      )}
    >
      {children}
    </span>
  );
}