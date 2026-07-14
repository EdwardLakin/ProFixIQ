"use client";

import type { SmartInsight } from "./types";

const TONES: Record<string, string> = {
  suggested_match: "border-amber-400/35 bg-amber-950/30 text-amber-100",
  no_stock: "border-red-400/35 bg-red-950/30 text-red-100",
  possible_mismatch: "border-orange-400/35 bg-orange-950/30 text-orange-100",
  on_po: "border-sky-400/35 bg-sky-950/30 text-sky-100",
  partial: "border-violet-400/35 bg-violet-950/30 text-violet-100",
  no_preferred_supplier: "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] text-[color:var(--theme-text-primary)]",
};

export function SmartInsightBadges({
  insights,
  onOpenInsight,
}: {
  insights?: SmartInsight[];
  onOpenInsight?: (insight: SmartInsight) => void;
}): JSX.Element {
  if (!insights?.length) {
    return <span className="text-xs text-[color:var(--theme-text-muted)]">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {insights.slice(0, 3).map((insight) => (
        <button
          key={insight.id}
          type="button"
          onClick={() => onOpenInsight?.(insight)}
          className={`rounded-full border px-2 py-1 text-[11px] font-medium ${
            TONES[insight.kind] ?? TONES.no_preferred_supplier
          }`}
          title="Open insight details"
        >
          {insight.label}
        </button>
      ))}
    </div>
  );
}
