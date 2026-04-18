"use client";

export type LearnedSuggestionCardItem = {
  id: string;
  title: string;
  summary: string;
  laborHours: number | null;
  parts: Array<{ name: string; qty: number }>;
  sourceCount: number;
  confidence: number | null;
};

function partsLabel(parts: Array<{ name: string; qty: number }>): string {
  return parts.map((p) => `${p.qty}x ${p.name}`).join(", ");
}

export default function LearnedSuggestionCard(props: {
  suggestion: LearnedSuggestionCardItem;
  onApplyLabor?: () => void;
  onAddAsJob: () => void;
  onDismiss: () => void;
}) {
  const { suggestion, onApplyLabor, onAddAsJob, onDismiss } = props;

  return (
    <div className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-neutral-200">
            Suggested from prior similar jobs
            {suggestion.sourceCount > 0 ? ` • ${suggestion.sourceCount} similar` : ""}
            {suggestion.laborHours != null ? ` • ${suggestion.laborHours}h labor` : ""}
          </div>

          <div className="mt-1 truncate text-sm font-semibold text-white">{suggestion.title}</div>
          {suggestion.summary ? (
            <details className="mt-1 text-[11px] text-neutral-300/90">
              <summary className="cursor-pointer text-neutral-400 hover:text-neutral-200">
                Details
              </summary>
              <div className="mt-1">{suggestion.summary}</div>
            </details>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-neutral-400">
            {suggestion.parts.length > 0 ? <span>Parts: {partsLabel(suggestion.parts)}</span> : null}
            {suggestion.confidence != null ? (
              <span>
                Confidence{" "}
                {suggestion.confidence > 1
                  ? `${Math.round(suggestion.confidence)}%`
                  : `${Math.round(suggestion.confidence * 100)}%`}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {suggestion.laborHours != null ? (
            <button
              type="button"
              onClick={onApplyLabor}
              className="rounded-full border border-[color:var(--copper,#C57A4A)]/45 bg-[color:var(--copper,#C57A4A)]/10 px-3 py-1 text-xs font-semibold text-[color:var(--copper,#C57A4A)] hover:bg-[color:var(--copper,#C57A4A)]/18"
            >
              Apply labor
            </button>
          ) : null}

          <button
            type="button"
            onClick={onAddAsJob}
            className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1 text-xs font-semibold text-white hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_82%,black)]"
          >
            Add as line
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1 text-xs text-neutral-300 hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_80%,black)]"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
