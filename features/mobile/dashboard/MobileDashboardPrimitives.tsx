"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function MobileDashboardPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl space-y-4 overflow-x-hidden px-3 py-3 sm:px-4">{children}</div>;
}

export function MobileDashboardHero({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: { href: string; label: string } }) {
  return (
    <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
      <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-copper)]">{eyebrow}</div>
      <h1 className="mt-2 text-2xl font-semibold leading-tight text-[color:var(--theme-text-primary)]">{title}</h1>
      <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">{subtitle}</p>
      {action ? <Link href={action.href} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl bg-[color:var(--accent-copper)] px-4 text-sm font-semibold text-white shadow-sm">{action.label}</Link> : null}
    </section>
  );
}

export function MobileMetricGrid({ items }: { items: Array<{ label: string; value: number | string; href?: string; tone?: "default" | "positive" | "warning" }> }) {
  return (
    <section className="grid min-w-0 grid-cols-2 gap-2">
      {items.map((item) => {
        const className = `min-w-0 rounded-2xl border p-3 ${item.tone === "warning" ? "border-amber-500/40 bg-amber-500/10" : item.tone === "positive" ? "border-emerald-500/35 bg-emerald-500/10" : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"}`;
        const body = <><div className="truncate text-xs text-[color:var(--theme-text-secondary)]">{item.label}</div><div className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">{item.value}</div></>;
        return item.href ? <Link key={item.label} href={item.href} className={className}>{body}</Link> : <div key={item.label} className={className}>{body}</div>;
      })}
    </section>
  );
}

export function MobileAttentionList({ title = "Needs attention", subtitle, items }: { title?: string; subtitle?: string; items: Array<{ title: string; detail: string; href: string; action: string; count?: number }> }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]">
      <div className="p-4"><h2 className="text-xl font-semibold text-[color:var(--theme-text-primary)]">{title}</h2>{subtitle ? <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">{subtitle}</p> : null}</div>
      <div className="divide-y divide-[color:var(--theme-border-soft)]">
        {items.length ? items.slice(0, 3).map((item) => <Link key={`${item.title}-${item.href}`} href={item.href} className="block p-4 active:bg-[color:var(--theme-surface-overlay)]"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-[color:var(--theme-text-primary)]">{item.count ? `${item.count} ` : ""}{item.title}</div><div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">{item.detail}</div></div><span className="shrink-0 text-sm font-medium text-[color:var(--accent-copper)]">{item.action} →</span></div></Link>) : <div className="p-4 text-sm text-[color:var(--theme-text-secondary)]">Nothing urgent right now.</div>}
      </div>
    </section>
  );
}

export function MobileActionGrid({ items }: { items: Array<{ title: string; detail: string; href: string }> }) {
  return <section className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">{items.slice(0, 4).map((item) => <Link key={item.href} href={item.href} className="min-w-0 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4"><div className="font-semibold text-[color:var(--theme-text-primary)]">{item.title}</div><div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">{item.detail}</div></Link>)}</section>;
}
