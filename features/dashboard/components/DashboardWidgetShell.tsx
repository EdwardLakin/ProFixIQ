"use client";

import type { ReactNode } from "react";
import Card from "@shared/components/ui/Card";
import { cn } from "@shared/lib/utils";

type DashboardWidgetShellProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  className?: string;
  contentClassName?: string;
};

export default function DashboardWidgetShell({
  eyebrow,
  title,
  subtitle,
  rightSlot,
  children,
  compact = false,
  className,
  contentClassName,
}: DashboardWidgetShellProps) {
  return (
    <Card
      className={cn(
        compact ? "px-4 py-4" : "px-5 py-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              {eyebrow}
            </div>
          ) : null}

          <h2 className="mt-1 text-base font-semibold text-white sm:text-lg">
            {title}
          </h2>

          {subtitle ? (
            <p className="mt-1 max-w-2xl text-xs text-neutral-400 sm:text-sm">
              {subtitle}
            </p>
          ) : null}
        </div>

        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>

      <div className={cn("mt-4", contentClassName)}>{children}</div>
    </Card>
  );
}
