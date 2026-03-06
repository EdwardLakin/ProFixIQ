"use client";

import type { ReactNode } from "react";

export default function DashboardWidgetShell(props: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  const { eyebrow, title, subtitle, rightSlot, children, compact = false } = props;

  return (
    <section
      className={[
        "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)]",
        "bg-gradient-to-br from-black/80 via-slate-950/90 to-black/85",
        "shadow-[0_20px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl",
        compact ? "px-4 py-4" : "px-4 py-4 sm:px-5 sm:py-5",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
              {eyebrow}
            </div>
          ) : null}

          <h2 className="mt-1 text-base font-semibold text-white sm:text-lg">
            {title}
          </h2>

          {subtitle ? (
            <p className="mt-1 text-xs text-neutral-400 sm:text-sm">{subtitle}</p>
          ) : null}
        </div>

        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>

      <div className="mt-4">{children}</div>
    </section>
  );
}
