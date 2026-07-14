"use client";

import type { ReactNode } from "react";
import { cn } from "@shared/lib/utils";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  align?: "start" | "center";
};

export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
  align = "start",
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:justify-between",
        align === "center" ? "sm:items-center" : "sm:items-start",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-muted)]">
            {eyebrow}
          </div>
        ) : null}

        <h2 className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)] sm:text-lg">
          {title}
        </h2>

        {subtitle ? (
          <p className="mt-1 max-w-2xl text-xs text-[color:var(--theme-text-secondary)] sm:text-sm">
            {subtitle}
          </p>
        ) : null}
      </div>

      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
