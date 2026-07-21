"use client";

import Link from "next/link";
import type {
  ShopAssistantAlert,
  ShopAssistantMetric,
  ShopAssistantState,
} from "../types/shopState";

type Props = {
  state: ShopAssistantState | null;
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  compact?: boolean;
  onRefresh?: () => void | Promise<void>;
};

function metricClass(metric: ShopAssistantMetric): string {
  if (metric.tone === "critical") return "border-red-400/35 bg-red-500/10";
  if (metric.tone === "warning") return "border-amber-400/35 bg-amber-500/10";
  if (metric.tone === "info") return "border-sky-400/25 bg-sky-500/5";
  return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]";
}

function alertClass(alert: ShopAssistantAlert): string {
  if (alert.level === "critical") return "border-red-400/35 bg-red-500/10";
  if (alert.level === "warning") return "border-amber-400/35 bg-amber-500/10";
  return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]";
}

export default function ShopAssistantOverview({
  state,
  loading = false,
  refreshing = false,
  error = null,
  compact = false,
  onRefresh,
}: Props) {
  return (
    <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
            Shop assistant
          </div>
          <h1 className={`${compact ? "text-2xl" : "text-3xl"} mt-2 font-semibold text-[color:var(--theme-text-primary)]`}>
            Shop command center
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
            Live operational state, proactive alerts, role-aware suggestions, and
            confirmed actions across the shop.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || refreshing}
          onClick={() => void onRefresh?.()}
          className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-secondary)] disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading && !state ? (
        <div className="mt-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
          Building the live shop summary…
        </div>
      ) : null}

      {state?.scope === "technician" ? (
        <div className="mt-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
            Technician guidance stays inside the work order
          </div>
          <p className="mt-1 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
            Open an assigned work order to use the existing technician assistant for
            diagnostics and job guidance.
          </p>
        </div>
      ) : null}

      {state && state.scope !== "technician" && state.metrics.length > 0 ? (
        <div className={`mt-4 grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
          {state.metrics.map((metric) => {
            const content = (
              <>
                <div className="text-2xl font-semibold text-[color:var(--theme-text-primary)]">
                  {metric.value}
                </div>
                <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                  {metric.label}
                </div>
              </>
            );

            return metric.href ? (
              <Link
                key={metric.key}
                href={metric.href}
                className={`rounded-2xl border p-3 ${metricClass(metric)}`}
              >
                {content}
              </Link>
            ) : (
              <div
                key={metric.key}
                className={`rounded-2xl border p-3 ${metricClass(metric)}`}
              >
                {content}
              </div>
            );
          })}
        </div>
      ) : null}

      {state && state.scope !== "technician" ? (
        <div className={`mt-4 grid gap-4 ${compact ? "" : "lg:grid-cols-2"}`}>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
              Needs attention
            </div>
            <div className="mt-2 space-y-2">
              {state.alerts.length === 0 ? (
                <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-secondary)]">
                  No overdue operational alerts are visible for your role.
                </div>
              ) : (
                state.alerts.slice(0, compact ? 4 : 6).map((alert) => {
                  const body = (
                    <>
                      <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {alert.title}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                        {alert.message}
                      </div>
                    </>
                  );

                  return alert.href ? (
                    <Link
                      key={alert.id}
                      href={alert.href}
                      className={`block rounded-2xl border p-3 ${alertClass(alert)}`}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div
                      key={alert.id}
                      className={`rounded-2xl border p-3 ${alertClass(alert)}`}
                    >
                      {body}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
              Suggested next moves
            </div>
            <div className="mt-2 space-y-2">
              {state.suggestions.length === 0 ? (
                <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-secondary)]">
                  No additional suggestions are available for your role right now.
                </div>
              ) : (
                state.suggestions.slice(0, compact ? 4 : 6).map((suggestion) => (
                  <Link
                    key={suggestion.id}
                    href={compact ? suggestion.href : suggestion.plannerHref ?? suggestion.href}
                    className="block rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
                  >
                    <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                      {suggestion.title}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                      {suggestion.description}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {state ? (
        <div className="mt-3 text-[10px] text-[color:var(--theme-text-muted)]">
          Updated {new Date(state.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {state.timezone}
        </div>
      ) : null}
    </section>
  );
}
