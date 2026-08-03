"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { requireMobileHref } from "@/features/mobile/navigation/mobile-route-continuity";

export function MobileDashboardPage({ children }: { children: ReactNode }) {
  return <div className="mobile-dashboard-page">{children}</div>;
}

export function MobileDashboardHero({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: { href: string; label: string };
}) {
  return (
    <section className="mobile-dashboard-hero">
      <div className="mobile-dashboard-hero__eyebrow">{eyebrow}</div>
      <h1 className="mobile-dashboard-hero__title">{title}</h1>
      <p className="mobile-dashboard-hero__subtitle">{subtitle}</p>
      {action ? (
        <Link
          href={requireMobileHref(action.href)}
          className="mobile-command-primary mt-5 flex w-full items-center justify-center gap-2 px-4 text-sm font-bold"
        >
          {action.label}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      ) : null}
    </section>
  );
}

export function MobileMetricGrid({
  items,
}: {
  items: Array<{
    label: string;
    value: number | string;
    href?: string;
    tone?: "default" | "positive" | "warning";
  }>;
}) {
  return (
    <section className="mobile-dashboard-metrics" aria-label="Current metrics">
      {items.map((item) => {
        const body = (
          <>
            <div className="mobile-dashboard-metric__label">{item.label}</div>
            <div className="mobile-dashboard-metric__value">{item.value}</div>
          </>
        );
        const props = {
          className: "mobile-dashboard-metric",
          "data-tone": item.tone ?? "default",
        } as const;

        return item.href ? (
          <Link key={item.label} href={requireMobileHref(item.href)} {...props}>
            {body}
          </Link>
        ) : (
          <div key={item.label} {...props}>
            {body}
          </div>
        );
      })}
    </section>
  );
}

export function MobileAttentionList({
  title = "Needs attention",
  subtitle,
  items,
}: {
  title?: string;
  subtitle?: string;
  items: Array<{
    title: string;
    detail: string;
    href: string;
    action: string;
    count?: number;
  }>;
}) {
  return (
    <section className="mobile-dashboard-attention">
      <div className="mobile-dashboard-attention__header">
        <div className="flex items-center gap-2">
          <span className="inline-grid h-8 w-8 place-items-center rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-300">
            <AlertTriangle aria-hidden className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-[-0.025em] text-[color:var(--theme-text-primary)]">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs leading-4 text-[color:var(--theme-text-secondary)]">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div>
        {items.length ? (
          items.map((item) => (
            <Link
              key={`${item.title}-${item.href}`}
              href={requireMobileHref(item.href)}
              className="mobile-dashboard-attention__row"
            >
              <div className="min-w-0">
                <div className="font-semibold text-[color:var(--theme-text-primary)]">
                  {item.count ? `${item.count} ` : ""}
                  {item.title}
                </div>
                <div className="mt-1 text-xs leading-4 text-[color:var(--theme-text-secondary)]">
                  {item.detail}
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[color:var(--accent-copper)]">
                {item.action}
                <ChevronRight aria-hidden className="h-4 w-4" />
              </span>
            </Link>
          ))
        ) : (
          <div className="mobile-dashboard-attention__row">
            <div className="flex items-center gap-3 text-sm text-[color:var(--theme-text-secondary)]">
              <CheckCircle2 aria-hidden className="h-5 w-5 text-emerald-500" />
              Nothing urgent right now.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function MobileActionGrid({
  items,
}: {
  items: Array<{ title: string; detail: string; href: string }>;
}) {
  return (
    <section className="mobile-dashboard-actions">
      <div className="mobile-dashboard-actions__header">
        <h2 className="text-lg font-bold tracking-[-0.025em] text-[color:var(--theme-text-primary)]">
          Workspace
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
          Open a role-specific mobile tool.
        </p>
      </div>
      <div className="mobile-dashboard-actions__list">
        {items.map((item) => (
          <Link
            key={`${item.href}-${item.title}`}
            href={requireMobileHref(item.href)}
            className="mobile-dashboard-action-row"
          >
            <div className="min-w-0">
              <div className="font-semibold text-[color:var(--theme-text-primary)]">
                {item.title}
              </div>
              <div className="mt-1 text-xs leading-4 text-[color:var(--theme-text-secondary)]">
                {item.detail}
              </div>
            </div>
            <ChevronRight
              aria-hidden
              className="h-5 w-5 shrink-0 text-[color:var(--accent-copper)]"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
