import Link from "next/link";
import type { ReactNode } from "react";

import DashboardViewSwitcher from "./DashboardViewSwitcher";
import type { DashboardView } from "@/features/dashboard/lib/dashboard-views";

export function DashboardShell({ children }: { children: ReactNode }) {
  return <div className="w-full space-y-4 xl:space-y-5">{children}</div>;
}

export function DashboardTopStrip({
  view,
  title,
  subtitle,
  name,
  actions,
  summary,
}: {
  view: DashboardView;
  title: string;
  subtitle: string;
  name: string;
  actions: Array<{ label: string; href: string }>;
  summary: Array<{ label: string; value: string }>;
}) {
  return (
    <section
      className="rounded-2xl border px-5 py-4 backdrop-blur-xl xl:px-6 xl:py-5"
      style={{
        borderColor: "color-mix(in srgb, var(--theme-card-border,#334155) 72%, transparent)",
        background: "var(--dashboard-hero-bg, var(--dashboard-shell-bg))",
      }}
    >
      <div className="flex flex-col gap-4 xl:gap-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-neutral-400">{title}</div>
            <h1 className="mt-1.5 text-3xl font-semibold text-white xl:text-4xl">Welcome back, {name}</h1>
            <p className="mt-1.5 max-w-3xl text-sm text-neutral-300 xl:text-[15px]">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DashboardViewSwitcher currentView={view} />
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:bg-black/40"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {summary.map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{item.label}</div>
              <div className="mt-1 text-xl font-semibold text-white">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DashboardSectionShell({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border p-4 ${className ?? ""}`}
      style={{
        borderColor: "color-mix(in srgb, var(--theme-card-border,#334155) 78%, transparent)",
        background: "color-mix(in srgb, var(--theme-card-bg,#111827) 88%, black)",
      }}
    >
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-white md:text-base">{title}</h2>
        {description ? <p className="mt-1 text-xs text-neutral-400">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function CompactSignalList({
  items,
}: {
  items: Array<{ label: string; value: string; tone?: "default" | "accent" }>;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div
          key={`${item.label}-${item.value}`}
          className="flex items-center justify-between rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-xs"
        >
          <span className="text-neutral-300">{item.label}</span>
          <span className={item.tone === "accent" ? "font-semibold text-[color:var(--brand-accent)]" : "font-semibold text-white"}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ActionRow({ actions }: { actions: Array<{ label: string; href: string; tone?: "primary" | "neutral" }> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => (
        <Link
          key={`${action.href}-${action.label}`}
          href={action.href}
          className={
            action.tone === "primary"
              ? "rounded-full border border-[var(--accent-copper-soft)]/70 bg-[var(--accent-copper)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--accent-copper-light)] transition hover:bg-[var(--accent-copper)] hover:text-black"
              : "rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:bg-black/40"
          }
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}
