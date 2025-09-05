"use client";

import { useEffect, useState } from "react";

type Suggestion = {
  name: string;
  laborHours: number;
  jobType: "diagnosis" | "repair" | "maintenance" | "tech-suggested";
  notes: string;
  aiComplaint?: string;
  aiCause?: string;
  aiCorrection?: string;
};

export default function SuggestedQuickAdd({
  jobId,
  workOrderId,
  vehicleId,
}: {
  jobId: string;
  workOrderId: string;
  vehicleId?: string | null;
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
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed");
      setItems(j.suggestions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load suggestions");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (jobId) void fetchSuggestions();
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
              estLaborHours: s.laborHours,
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
          className="text-xs px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800"
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
            className="text-left border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 rounded p-3"
          >
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-neutral-400">
              {s.jobType} • {s.laborHours.toFixed(1)}h
            </div>
            {s.notes && (
              <div className="text-xs text-neutral-500 mt-1">{s.notes}</div>
            )}
          </button>
        ))}

        {!loading && items.length === 0 && (
          <div className="text-xs text-neutral-400">No suggestions yet.</div>
        )}
      </div>
    </div>
  );
}

