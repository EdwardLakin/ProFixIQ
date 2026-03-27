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
    <div className="rounded-2xl border border-[color:var(--copper,#C57A4A)]/25 bg-[color:var(--copper,#C57A4A)]/8 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-white">
              {suggestion.title}
            </div>

            <span className="rounded-full border border-[color:var(--copper,#C57A4A)]/35 bg-black/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--copper,#C57A4A)]">
              Based on previous jobs
            </span>

            {suggestion.sourceCount > 0 ? (
              <span className="text-[11px] text-neutral-400">
                {suggestion.sourceCount} similar
              </span>
            ) : null}
          </div>

          {suggestion.summary ? (
            <div className="mt-1 text-xs text-neutral-300">
              {suggestion.summary}
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-neutral-400">
            {suggestion.laborHours != null ? (
              <span>
                Labor:{" "}
                <span className="text-neutral-200">
                  {suggestion.laborHours} hr
                </span>
              </span>
            ) : null}

            {suggestion.parts.length > 0 ? (
              <span>
                Parts:{" "}
                <span className="text-neutral-200">
                  {partsLabel(suggestion.parts)}
                </span>
              </span>
            ) : null}

            {suggestion.confidence != null ? (
              <span>
                Confidence:{" "}
                <span className="text-neutral-200">
                  {suggestion.confidence > 1
                    ? `${Math.round(suggestion.confidence)}%`
                    : `${Math.round(suggestion.confidence * 100)}%`}
                </span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {suggestion.laborHours != null ? (
            <button
              type="button"
              onClick={onApplyLabor}
              className="rounded-full border border-[color:var(--copper,#C57A4A)]/45 bg-[color:var(--copper,#C57A4A)]/12 px-3 py-1 text-xs font-semibold text-[color:var(--copper,#C57A4A)] hover:bg-[color:var(--copper,#C57A4A)]/18"
            >
              Apply labor
            </button>
          ) : null}

          <button
            type="button"
            onClick={onAddAsJob}
            className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs font-semibold text-white hover:bg-black/60"
          >
            Add as job
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs text-neutral-300 hover:bg-black/50"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
