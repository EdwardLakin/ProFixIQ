import Link from "next/link";
import type { ReactNode } from "react";

import DashboardViewSwitcher from "./DashboardViewSwitcher";
import type { DashboardView } from "@/features/dashboard/lib/dashboard-views";

export function DashboardShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1580px] space-y-2.5 pt-1 md:space-y-3.5 md:pt-2">{children}</div>;
}

export function DashboardTopStrip({
  view,
  title,
  subtitle,
  name,
  actions,
}: {
  view: DashboardView;
  title: string;
  subtitle: string;
  name: string;
  actions: Array<{ label: string; href: string; tone?: "primary" | "secondary" }>;
}) {
  return (
    <section
      className="relative z-10 rounded-2xl border px-4 py-3 backdrop-blur-xl md:px-5"
      style={{
        borderColor: "color-mix(in srgb, var(--theme-card-border,#334155) 72%, transparent)",
        background:
          "linear-gradient(135deg, rgba(2,6,23,0.82), color-mix(in srgb, var(--brand-secondary,#0f172a) 72%, rgba(0,0,0,0.9)))",
        boxShadow: "0 16px 30px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{title}</div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white md:text-2xl">{name}</h1>
          <p className="mt-1 text-xs text-neutral-300 md:text-sm">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DashboardViewSwitcher currentView={view} />
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={
                action.tone === "primary"
                  ? "rounded-full border border-[var(--accent-copper-soft)]/80 bg-[var(--accent-copper)]/20 px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-copper-light)] transition hover:bg-[var(--accent-copper)] hover:text-black"
                  : "rounded-full border border-white/10 bg-black/25 px-3.5 py-1.5 text-xs font-semibold text-neutral-100 transition hover:bg-black/40"
              }
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MetricStrip({ items }: { items: Array<{ label: string; value: string; tone?: "default" | "accent" }> }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map((item, index) => (
        <section
          key={item.label}
          className="relative rounded-xl border px-3 py-2.5"
          style={{
            borderColor: "color-mix(in srgb, var(--theme-card-border,#334155) 85%, transparent)",
            background: "linear-gradient(155deg, rgba(15,23,42,0.96), rgba(2,6,23,0.88))",
            boxShadow: "inset 0 1px 0 rgba(148,163,184,0.12)",
          }}
        >
          {index < items.length - 1 ? (
            <span
              className="pointer-events-none absolute right-0 top-2 hidden h-[calc(100%-1rem)] w-px lg:block"
              style={{ background: "linear-gradient(to bottom, transparent, rgba(148,163,184,0.35), transparent)" }}
            />
          ) : null}
          <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-400">{item.label}</div>
          <div
            className={
              item.tone === "accent"
                ? "mt-1 text-[1.85rem] font-semibold leading-none text-[var(--brand-accent,#E39A6E)]"
                : "mt-1 text-[1.85rem] font-semibold leading-none text-white"
            }
          >
            {item.value}
          </div>
        </section>
      ))}
    </div>
  );
}

export function DashboardPanel({
  eyebrow,
  title,
  action,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border p-3 md:p-3.5 ${className ?? ""}`}
      style={{
        borderColor: "color-mix(in srgb, var(--theme-card-border,#334155) 78%, transparent)",
        background: "linear-gradient(155deg, rgba(2,6,23,0.9), rgba(10,15,28,0.78))",
      }}
    >
      <header className="mb-2.5 flex items-start justify-between gap-2">
        <div>
          {eyebrow ? <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{eyebrow}</div> : null}
          <h2 className="text-sm font-semibold text-white md:text-base">{title}</h2>
        </div>
        {action}
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
          className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs"
        >
          <span className="text-neutral-300">{item.label}</span>
          <span className={item.tone === "accent" ? "font-semibold text-[var(--brand-accent,#E39A6E)]" : "font-semibold text-white"}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ActionRow({ actions }: { actions: Array<{ label: string; href: string; tone?: "primary" | "neutral"; detail?: string }> }) {
  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <div key={`${action.href}-${action.label}`} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-white">{action.label}</div>
            <Link
              href={action.href}
              className={
                action.tone === "primary"
                  ? "rounded-full border border-[var(--accent-copper-soft)]/80 bg-[var(--accent-copper)]/15 px-2.5 py-1 text-[10px] font-semibold text-[var(--accent-copper-light)]"
                  : "rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-neutral-200"
              }
            >
              Open
            </Link>
          </div>
          {action.detail ? <div className="mt-1 text-[11px] text-neutral-400">{action.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}
