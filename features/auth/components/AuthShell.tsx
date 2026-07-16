"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { cn } from "@/features/shared/lib/utils";
import ThemeToggleButton from "@/features/shared/components/ThemeToggleButton";

type AuthShellProps = {
  children: ReactNode;
  viewportClassName?: string;
  cardClassName?: string;
  productLabel?: string;
  heroTitle?: string;
  heroDescription?: string;
  highlights?: string[];
  backHref?: string;
};

export default function AuthShell({
  children,
  viewportClassName,
  cardClassName,
  productLabel = "Shop operations",
  heroTitle = "Run the whole shop with confidence.",
  heroDescription = "Work orders, inspections, approvals, parts, workforce, and customer communication—connected in one secure operating system.",
  highlights = [
    "Tenant-scoped access",
    "Role-aware workflows",
    "Secure service records",
  ],
  backHref = "/",
}: AuthShellProps) {
  return (
    <div
      className={cn(
        "relative min-h-screen min-h-[100dvh] overflow-hidden bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]",
        viewportClassName,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[var(--theme-gradient-page)]" />
      <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-[color:color-mix(in_srgb,var(--accent-copper)_11%,transparent)] blur-3xl" />

      <header className="relative z-10 flex h-16 items-center justify-between border-b border-[color:var(--theme-border-soft)] bg-[color:color-mix(in_srgb,var(--theme-surface-overlay)_82%,transparent)] px-4 backdrop-blur-xl sm:px-7">
        <Link
          href={backHref}
          className="inline-flex items-center gap-3"
          aria-label="ProFixIQ home"
        >
          <span
            className="text-xl tracking-[0.08em] text-[color:var(--theme-text-primary)] sm:text-2xl"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            PRO<span className="text-[var(--accent-copper)]">FIX</span>IQ
          </span>
          <span className="hidden h-5 w-px bg-[color:var(--theme-border-strong)] sm:block" />
          <span className="hidden text-xs text-[color:var(--theme-text-muted)] sm:block">
            {productLabel}
          </span>
        </Link>
        <ThemeToggleButton />
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-7xl items-center gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,520px)] lg:px-10 lg:py-12">
        <section className="hidden max-w-2xl lg:block">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--accent-copper)_35%,var(--theme-border-soft))] bg-[color:color-mix(in_srgb,var(--accent-copper)_10%,transparent)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Secure access
          </div>
          <h2 className="max-w-xl text-5xl font-semibold leading-[1.05] tracking-[-0.045em] text-[color:var(--theme-text-primary)] xl:text-6xl">
            {heroTitle}
          </h2>
          <p className="mt-6 max-w-xl text-base leading-7 text-[color:var(--theme-text-secondary)]">
            {heroDescription}
          </p>
          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
            {highlights.map((highlight) => (
              <div
                key={highlight}
                className="flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-3 text-xs font-medium text-[color:var(--theme-text-secondary)] backdrop-blur"
              >
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-[var(--accent-copper)]"
                  aria-hidden
                />
                {highlight}
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-[520px]">
          <div
            className={cn(
              "rounded-[1.75rem] border border-[color:var(--theme-border-soft)] bg-[color:color-mix(in_srgb,var(--theme-surface-overlay)_92%,transparent)] p-5 shadow-[var(--theme-shadow-strong)] backdrop-blur-2xl sm:p-8",
              cardClassName,
            )}
          >
            {children}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[11px] text-[color:var(--theme-text-muted)]">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Encrypted sessions · Tenant-scoped access
            </span>
            <Link
              href="/legal/terms"
              className="hover:text-[var(--accent-copper)]"
            >
              Terms
            </Link>
            <Link
              href="/legal/privacy"
              className="hover:text-[var(--accent-copper)]"
            >
              Privacy
            </Link>
            <Link
              href="/legal/support"
              className="hover:text-[var(--accent-copper)]"
            >
              Support
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
