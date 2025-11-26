// features/work-orders/components/WorkOrderSuggestionsPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

type Suggestion = {
  name: string;
  laborHours: number | null;
  jobType: "diagnosis" | "repair" | "maintenance" | "tech-suggested";
  notes: string;
  aiComplaint?: string;
  aiCause?: string;
  aiCorrection?: string;
};

type VehicleLite = {
  id: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
};

function asSuggestions(input: unknown): Suggestion[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw: any) => {
    const name =
      typeof raw?.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : "Suggested item";
    const hours = Number(raw?.laborHours);
    const jobType =
      raw?.jobType === "diagnosis" ||
      raw?.jobType === "repair" ||
      raw?.jobType === "maintenance" ||
      raw?.jobType === "tech-suggested"
        ? raw.jobType
        : "maintenance";
    const notes = typeof raw?.notes === "string" ? raw.notes : "";
    return {
      name,
      laborHours: Number.isFinite(hours) ? hours : null,
      jobType,
      notes,
      aiComplaint:
        typeof raw?.aiComplaint === "string" ? raw.aiComplaint : undefined,
      aiCause: typeof raw?.aiCause === "string" ? raw.aiCause : undefined,
      aiCorrection:
        typeof raw?.aiCorrection === "string" ? raw.aiCorrection : undefined,
    };
  });
}

export function WorkOrderSuggestionsPanel(props: {
  workOrderId: string;
  vehicleId: string | null;
  vehicleMeta: { year: string | null; make: string | null; model: string | null };
  onAdded?: () => void | Promise<void>;
}) {
  const { workOrderId, vehicleId, vehicleMeta, onAdded } = props;

  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const vehicleLite: VehicleLite | null = vehicleId
    ? {
        id: vehicleId,
        year: vehicleMeta.year,
        make: vehicleMeta.make,
        model: vehicleMeta.model,
      }
    : null;

  async function fetchSuggestions() {
    if (!workOrderId) return;
    setLoading(true);
    setError(null);
    try {
      const body: any = { workOrderId };
      if (vehicleLite) body.vehicleId = vehicleLite;

      const res = await fetch("/api/work-orders/suggest-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to load suggestions");
      setItems(asSuggestions(j?.suggestions));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load suggestions",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // auto-run once we actually have a WO and vehicle
    if (workOrderId) void fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId, vehicleId]);

  async function addSuggestedLine(s: Suggestion) {
    if (!workOrderId) return;
    setAdding(s.name);
    setError(null);

    try {
      const res = await fetch("/api/work-orders/add-suggested-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          vehicleId: vehicleId ?? null,
          items: [
            {
              description: s.name,
              jobType: s.jobType,
              laborHours: s.laborHours ?? 0,
              notes: s.notes,
              aiComplaint: s.aiComplaint,
              aiCause: s.aiCause,
              aiCorrection: s.aiCorrection,
            },
          ],
        }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || "Failed to add job line");
      }

      toast.success("Added job to current lines");
      await onAdded?.();
    } catch (e) {
      console.error(e);
      toast.error(
        e instanceof Error ? e.message : "Failed to add job line",
      );
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-orange-300">
          Suggested jobs (AI + service rules)
        </h2>
        <button
          type="button"
          onClick={fetchSuggestions}
          disabled={loading}
          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-60"
        >
          {loading ? "Thinking…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="mb-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((s) => (
          <button
            key={s.name}
            type="button"
            onClick={() => addSuggestedLine(s)}
            disabled={adding === s.name}
            className="rounded border border-neutral-800 bg-neutral-900 p-3 text-left hover:bg-neutral-800 disabled:opacity-60"
          >
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-neutral-400">
              {s.jobType} •{" "}
              {typeof s.laborHours === "number"
                ? s.laborHours.toFixed(1)
                : "—"}
              h
            </div>
            {s.notes && (
              <div className="mt-1 text-xs text-neutral-500">
                {s.notes}
              </div>
            )}
          </button>
        ))}

        {!loading && items.length === 0 && (
          <div className="text-xs text-neutral-400">
            No suggestions yet. Save customer & vehicle first.
          </div>
        )}
      </div>
    </div>
  );
}