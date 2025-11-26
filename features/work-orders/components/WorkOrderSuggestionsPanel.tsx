"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

type JobType = "diagnosis" | "repair" | "maintenance" | "tech-suggested";

type Suggestion = {
  name: string;
  serviceCode?: string;
  laborHours: number | null;
  jobType: JobType;
  notes: string;
  aiComplaint?: string;
  aiCause?: string;
  aiCorrection?: string;
};

function asSuggestions(input: unknown): Suggestion[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw: any) => {
    const name =
      typeof raw?.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : "Suggested item";

    const hours = Number(raw?.laborHours);
    const jobType: JobType =
      raw?.jobType === "diagnosis" ||
      raw?.jobType === "repair" ||
      raw?.jobType === "maintenance" ||
      raw?.jobType === "tech-suggested"
        ? raw.jobType
        : "maintenance";

    const notes = typeof raw?.notes === "string" ? raw.notes : "";

    const serviceCode =
      typeof raw?.serviceCode === "string" && raw.serviceCode.trim()
        ? raw.serviceCode.trim()
        : undefined;

    return {
      name,
      serviceCode,
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
  odometerKm?: number | null;
  onAdded?: () => void | Promise<void>;
}) {
  const { workOrderId, vehicleId, odometerKm, onAdded } = props;

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadSuggestions() {
    if (!workOrderId) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ workOrderId });
      const res = await fetch(
        `/api/work-orders/maintenance-suggestions?${params.toString()}`
      );
      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(j?.error || "Failed to load suggestions");
      }

      setItems(asSuggestions(j?.suggestions));
      if (j?.status === "error" && j?.error_message) {
        setError(j.error_message);
      }
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Failed to load suggestions"
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function refreshSuggestions() {
    if (!workOrderId) return;
    setRefreshing(true);
    setError(null);

    try {
      const res = await fetch("/api/work-orders/maintenance-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j?.error || "Failed to recompute suggestions");
      }

      setItems(asSuggestions(j?.suggestions));
      toast.success("Maintenance recommendations updated");
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Failed to recompute suggestions"
      );
      toast.error("Could not update maintenance recommendations");
    } finally {
      setRefreshing(false);
    }
  }

  async function addSuggestionAsLine(s: Suggestion) {
    if (!workOrderId) return;
    setAdding(s.name);
    try {
      const res = await fetch("/api/work-orders/add-suggested-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          vehicleId: vehicleId ?? null,
          odometerKm: odometerKm ?? null,
          items: [
            {
              description: s.name,
              serviceCode: s.serviceCode,
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

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || "Failed to add job line");
      }

      // remove just this suggestion
      setItems((prev) =>
        prev.filter(
          (item) =>
            item.name !== s.name || item.serviceCode !== s.serviceCode
        )
      );

      toast.success("Added maintenance job to work order");
      window.dispatchEvent(new CustomEvent("wo:line-added"));
      await onAdded?.();
    } catch (e) {
      console.error(e);
      toast.error(
        e instanceof Error ? e.message : "Failed to add job line"
      );
    } finally {
      setAdding(null);
    }
  }

  useEffect(() => {
    if (workOrderId) {
      void loadSuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId]);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-orange-300">
          Suggested maintenance (AI + history)
        </h2>
        <button
          type="button"
          onClick={refreshSuggestions}
          disabled={refreshing}
          className="text-xs px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 disabled:opacity-60"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="mb-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {loading && !items.length && !error && (
        <p className="text-xs text-neutral-400">Loading suggestions…</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((s) => (
          <button
            key={`${s.serviceCode ?? "svc"}:${s.name}`}
            type="button"
            onClick={() => addSuggestionAsLine(s)}
            disabled={adding === s.name}
            className="text-left border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 rounded p-3 disabled:opacity-60"
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
              <div className="text-xs text-neutral-500 mt-1">
                {s.notes}
              </div>
            )}
          </button>
        ))}

        {!loading && items.length === 0 && !error && (
          <div className="text-xs text-neutral-400">
            No maintenance items are due right now. Click Refresh to re-check.
          </div>
        )}
      </div>
    </div>
  );
}