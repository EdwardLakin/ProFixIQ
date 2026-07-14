"use client";

import { cn } from "@shared/lib/utils";

const COPPER_LIGHT = "var(--accent-copper-light)";

export default function Footer({ className }: { className?: string }) {
  return (
    <div className={cn("w-full", className)}>
      <div className="mx-auto max-w-6xl px-4">
        <div className="relative mb-6 overflow-hidden rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 backdrop-blur-xl">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full blur-3xl"
            style={{ background: "rgba(197,122,74,0.12)" }}
          />
          <div
            className="pointer-events-none absolute -left-28 -bottom-28 h-96 w-96 rounded-full blur-3xl"
            style={{ background: "var(--theme-surface-inset)" }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.10]"
            style={{
              backgroundImage:
                "var(--theme-gradient-panel)",
            }}
          />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
                Quick truth
              </div>
              <div className="mt-2 text-base font-extrabold text-[color:var(--theme-text-primary)] sm:text-lg">
                If you’re still reading, you’re already wasting time. Let ProFixIQ set the shop up for you.
              </div>
              <div className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
                Get a workflow that fits fleet reality — inspections → quotes → parts → approvals → portal.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="#"
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-5 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-inset)]"
              >
                See what’s included
              </a>
              <a
                href="#"
                className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-extrabold text-[color:var(--theme-text-on-accent)] transition hover:brightness-110"
                style={{
                  backgroundColor: "rgba(197,122,74,0.95)",
                  boxShadow: "0 0 30px rgba(197,122,74,0.25)",
                }}
              >
                Run Instant Shop Analysis
              </a>
            </div>
          </div>

          <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--theme-border-soft)] pt-4">
            <div className="text-xs text-[color:var(--theme-text-muted)]">
              Next: social links + verified shop reviews
            </div>
            <div className="text-xs text-[color:var(--theme-text-muted)]">
              <span style={{ color: COPPER_LIGHT }}>ProFixIQ</span> • Heavy-duty &amp; fleet shop OS
            </div>
          </div>
        </div>
      </div>

      <footer
        className={cn(
          "w-full border-t border-[color:var(--theme-border-soft)] px-4 py-8 text-center",
          "bg-[color:var(--theme-surface-inset)] text-sm text-[color:var(--theme-text-secondary)] backdrop-blur-xl transition-all",
          "hover:text-[color:var(--theme-text-primary)]",
        )}
      >
        <p className="font-mono text-xs tracking-wide sm:text-sm">
          © {new Date().getFullYear()}{" "}
          <span className="font-semibold" style={{ color: COPPER_LIGHT }}>
            ProFixIQ
          </span>
          . Built for pros, powered by AI.
        </p>
      </footer>
    </div>
  );
}
