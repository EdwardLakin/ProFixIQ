"use client";

import type { ReactNode } from "react";
import { cn } from "@shared/lib/utils";

export type DashboardModuleMode = "signal" | "standard" | "feature";

export function DashboardModuleShell({
  mode = "standard",
  className,
  children,
}: {
  mode?: DashboardModuleMode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "h-full min-h-0 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:color-mix(in_srgb,var(--theme-card-bg,var(--theme-surface-page))_90%,_var(--theme-surface-page))] text-[color:var(--theme-text-primary)]",
        mode === "signal" ? "p-3.5" : mode === "feature" ? "p-5" : "p-4",
        className,
      )}
    >
      <div className="flex h-full min-h-0 flex-col gap-3">{children}</div>
    </section>
  );
}

export function DashboardModuleHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">{eyebrow}</div>
        ) : null}
        <h3 className="mt-1 truncate text-base font-semibold tracking-tight text-[color:var(--theme-text-primary)]">{title}</h3>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function DashboardMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "primary" | "accent"; }) {
  const toneClass =
    tone === "accent"
      ? "text-[color:var(--brand-accent)]"
      : tone === "primary"
        ? "text-[color:var(--brand-primary)]"
        : "text-[color:var(--theme-text-primary)]";

  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold leading-none", toneClass)}>{value}</div>
    </div>
  );
}

export function DashboardMetricRow({ children, columns = 3 }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  return <div className={cn("grid gap-2.5", columns === 2 ? "grid-cols-2" : columns === 4 ? "grid-cols-2 xl:grid-cols-4" : "grid-cols-3")}>{children}</div>;
}

export function DashboardSignalList({ items }: { items: Array<{ label: string; value?: string; tone?: "default" | "accent"; }>; }) {
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={`${item.label}-${item.value ?? ""}`} className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-2 text-xs">
          <span className="text-[color:var(--theme-text-secondary)]">{item.label}</span>
          {item.value ? (
            <span className={cn("font-semibold", item.tone === "accent" ? "text-[color:var(--brand-accent)]" : "text-[color:var(--theme-text-primary)]")}>{item.value}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function DashboardActionBar({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex items-center justify-between gap-2 border-t border-[color:var(--theme-border-soft)] pt-2">{children}</div>;
}
