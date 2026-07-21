"use client";

import ShopAlertList from "@/features/shop-assistant/components/ShopAlertList";
import ShopStateMetricGrid from "@/features/shop-assistant/components/ShopStateMetricGrid";
import ShopSuggestionList from "@/features/shop-assistant/components/ShopSuggestionList";
import { useShopAssistantState } from "@/features/shop-assistant/hooks/useShopAssistantState";

type Props = {
  onPrompt: (prompt: string) => void;
  refreshToken?: string | number;
};

function roleLabel(role: string): string {
  return role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ShopAssistantDashboard({
  onPrompt,
  refreshToken,
}: Props) {
  const { state, loading, error, refresh } =
    useShopAssistantState(refreshToken);

  if (loading && !state) {
    return (
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
        Loading the live shop picture…
      </section>
    );
  }

  if (!state) {
    return (
      <section className="rounded-3xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-[color:var(--theme-text-primary)]">
        <div>{error ?? "The live shop picture is unavailable."}</div>
        <button
          type="button"
          className="mt-3 rounded-full border border-current/30 px-3 py-1 text-xs font-semibold"
          onClick={() => void refresh()}
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
            {roleLabel(state.role)} view • live shop state
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
            {state.headline}
          </h1>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Updated {new Date(state.generatedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
        <button
          type="button"
          className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs text-[color:var(--theme-text-secondary)]"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </header>

      <ShopStateMetricGrid metrics={state.metrics} />

      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Needs attention
          </h2>
          <ShopAlertList alerts={state.alerts} />
        </div>
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Suggested next moves
          </h2>
          <ShopSuggestionList
            suggestions={state.suggestions}
            onSelect={onPrompt}
          />
        </div>
      </div>

      {error ? (
        <div className="text-xs text-amber-300">
          The latest background refresh failed; showing the most recent shop state.
        </div>
      ) : null}
    </section>
  );
}
