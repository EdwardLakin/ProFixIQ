"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";


type Suggestion = {
  name: string;
  laborHours: number | null;
  jobType: "diagnosis" | "repair" | "maintenance" | "tech-suggested";
  notes: string;
  aiComplaint?: string;
  aiCause?: string;
  aiCorrection?: string;
};

type SuggestionResponse = {
  suggestions?: unknown;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asSuggestions(input: unknown): Suggestion[] {
  if (!Array.isArray(input)) return [];

  const suggestions: Suggestion[] = [];
  for (const value of input) {
    if (!isRecord(value)) continue;

    const name =
      typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : "Suggested item";
    const rawHours = Number(value.laborHours);
    const jobType =
      value.jobType === "diagnosis" ||
      value.jobType === "repair" ||
      value.jobType === "maintenance" ||
      value.jobType === "tech-suggested"
        ? value.jobType
        : "maintenance";

    suggestions.push({
      name,
      laborHours: Number.isFinite(rawHours) ? rawHours : null,
      jobType,
      notes: typeof value.notes === "string" ? value.notes : "",
      aiComplaint: optionalString(value.aiComplaint),
      aiCause: optionalString(value.aiCause),
      aiCorrection: optionalString(value.aiCorrection),
    });
  }

  return suggestions;
}

export default function SuggestedQuickAdd(props: {
  jobId: string;
  workOrderId: string;
  vehicleId?: string | null;
  onAdded?: () => void | Promise<void>;
}) {
  const { jobId, workOrderId, vehicleId, onAdded } = props;
  const pathname = usePathname();
  const mobileRoute = pathname.startsWith("/mobile");

  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function fetchSuggestions() {
    if (mobileRoute) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/work-orders/suggest-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          vehicleId: vehicleId ?? null,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | SuggestionResponse
        | null;
      if (!response.ok) {
        throw new Error(body?.error || "Failed to load suggestions");
      }
      setItems(asSuggestions(body?.suggestions));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load suggestions",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (jobId && !mobileRoute) void fetchSuggestions();
    // fetchSuggestions intentionally remains an explicit desktop action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, mobileRoute]);

  async function addQuote(suggestion: Suggestion) {
    setAdding(suggestion.name);
    try {
      const response = await fetch("/api/work-orders/quotes/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          vehicleId: vehicleId ?? null,
          items: [
            {
              description: suggestion.name,
              jobType: suggestion.jobType,
              estLaborHours: suggestion.laborHours ?? 0,
              notes: suggestion.notes,
              aiComplaint: suggestion.aiComplaint,
              aiCause: suggestion.aiCause,
              aiCorrection: suggestion.aiCorrection,
            },
          ],
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error || "Failed to add quote line");
      }

      await onAdded?.();
    } catch (caught) {
      window.alert(
        caught instanceof Error ? caught.message : "Failed to add quote line",
      );
    } finally {
      setAdding(null);
    }
  }

  if (mobileRoute) {
    return (
      <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
            Technician controlled
          </div>
          <span className="rounded-full border border-[var(--accent-copper-soft)]/50 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[var(--accent-copper-light)]">
            Manual
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
          Automatic repair suggestions are off in the technician mobile view.
          Open <span className="font-semibold text-[color:var(--theme-text-primary)]">AI Assist</span>{" "}
          when you have a diagnosis, testing, specification, or repair question.
          Nothing is added without your action.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-orange-400">AI Suggestions</h3>
        <button
          type="button"
          onClick={() => void fetchSuggestions()}
          disabled={loading}
          className="rounded border border-[color:var(--theme-border-soft)] px-2 py-1 text-xs hover:bg-[color:var(--theme-surface-panel-strong)] disabled:opacity-60"
        >
          {loading ? "Thinking…" : "Regenerate"}
        </button>
      </div>

      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((suggestion) => (
          <button
            key={suggestion.name}
            type="button"
            onClick={() => void addQuote(suggestion)}
            disabled={adding === suggestion.name}
            className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3 text-left hover:bg-[color:var(--theme-surface-panel-strong)] disabled:opacity-60"
          >
            <div className="font-medium">{suggestion.name}</div>
            <div className="text-xs text-[color:var(--theme-text-secondary)]">
              {suggestion.jobType} •{" "}
              {typeof suggestion.laborHours === "number"
                ? suggestion.laborHours.toFixed(1)
                : "—"}
              h
            </div>
            {suggestion.notes ? (
              <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                {suggestion.notes}
              </div>
            ) : null}
          </button>
        ))}

        {!loading && items.length === 0 ? (
          <div className="text-xs text-[color:var(--theme-text-secondary)]">
            No suggestions yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
