"use client";

import { useEffect, useState } from "react";

type Suggestion = {
  name: string;
  laborHours: number | null; // ← allow null in our TS shape
  jobType: "diagnosis" | "repair" | "maintenance" | "tech-suggested";
  notes: string;
  aiComplaint?: string;
  aiCause?: string;
  aiCorrection?: string;
};

function asSuggestions(input: any): Suggestion[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw) => {
    const name = typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : "Suggested item";
    const hours = Number(raw?.laborHours);
    const jobType =
      raw?.jobType === "diagnosis" ||
      raw?.jobType === "repair" ||
      raw?.jobType === "maintenance" ||
      raw?.jobType === "tech-suggested"
        ? raw.jobType
        : "maintenance"; // sane default
    const notes = typeof raw?.notes === "string" ? raw.notes : "";
    return {
      name,
      laborHours: Number.isFinite(hours) ? hours : null,
      jobType,
      notes,
      aiComplaint: typeof raw?.aiComplaint === "string" ? raw.aiComplaint : undefined,
      aiCause: typeof raw?.aiCause === "string" ? raw.aiCause : undefined,
      aiCorrection: typeof raw?.aiCorrection === "string" ? raw.aiCorrection : undefined,
    } as Suggestion;
  });
}

export default function SuggestedQuickAdd({
  jobId,
  workOrderId,
  vehicleId,
  onAdded, // <-- NEW
}: {
  jobId: string;
  workOrderId: string;
  vehicleId?: string | null;
  onAdded?: () => void | Promise<void>; // <-- NEW
}) {
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function fetchSuggestions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/work-orders/suggest-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to load suggestions");
      setItems(asSuggestions(j?.suggestions));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load suggestions");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (jobId) void fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function addQuote(s: Suggestion) {
    setAdding(s.name);
    try {
      const res = await fetch("/api/work-orders/quotes/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          vehicleId: vehicleId ?? null,
          items: [
            {
              description: s.name,
              jobType: s.jobType,
              estLaborHours: s.laborHours ?? 0, // ← safe default
              notes: s.notes,
              aiComplaint: s.aiComplaint,
              aiCause: s.aiCause,
              aiCorrection: s.aiCorrection,
            },
          ],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Failed to add quote line");
      }

      // ✅ Notify parent if provided
      await onAdded?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add quote line");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-orange-400">AI Suggestions</h3>
        <button
          onClick={fetchSuggestions}
          disabled={loading}
          className="text-xs px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 disabled:opacity-60"
        >
          {loading ? "Thinking…" : "Regenerate"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((s) => (
          <button
            key={s.name}
            onClick={() => addQuote(s)}
            disabled={adding === s.name}
            className="text-left border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 rounded p-3 disabled:opacity-60"
          >
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-neutral-400">
              {s.jobType} • {typeof s.laborHours === "number" ? s.laborHours.toFixed(1) : "—"}h
            </div>
            {s.notes && <div className="text-xs text-neutral-500 mt-1">{s.notes}</div>}
          </button>
        ))}

        {!loading && items.length === 0 && (
          <div className="text-xs text-neutral-400">No suggestions yet.</div>
        )}
      </div>
    </div>
  );
}