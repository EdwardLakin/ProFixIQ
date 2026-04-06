"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMaintenanceBundleToWorkOrder,
  dismissMaintenanceSuggestion,
  fetchCreateFlowSuggestions,
  type MaintenanceSuggestionRow,
} from "@/features/maintenance/lib/createFlowSuggestions";

type Props = {
  workOrderId: string;
  vehicleId: string | null;
  onChanged?: () => void | Promise<void>;
};

export default function CreateFlowMaintenancePanel({
  workOrderId,
  vehicleId,
  onChanged,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<MaintenanceSuggestionRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicleId) {
      setItems([]);
      setSelected({});
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const rows = await fetchCreateFlowSuggestions(vehicleId);
        if (cancelled) return;
        setItems(rows);
        setSelected(
          Object.fromEntries(rows.map((row) => [row.code, true])),
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load suggestions.");
          setItems([]);
          setSelected({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  const selectedCodes = useMemo(
    () => items.filter((item) => selected[item.code]).map((item) => item.code),
    [items, selected],
  );

  function toggleAll(next: boolean) {
    setSelected(Object.fromEntries(items.map((item) => [item.code, next])));
  }

  async function addSelected() {
    if (!vehicleId || !selectedCodes.length || busy) return;

    try {
      setBusy(true);
      setError(null);

      await addMaintenanceBundleToWorkOrder({
        workOrderId,
        vehicleId,
        items: selectedCodes,
      });

      setItems((prev) => prev.filter((item) => !selectedCodes.includes(item.code)));
      setSelected((prev) => {
        const next = { ...prev };
        for (const code of selectedCodes) delete next[code];
        return next;
      });

      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add selected items.");
    } finally {
      setBusy(false);
    }
  }

  async function dismissOne(serviceCode: string) {
    if (!vehicleId || busy) return;

    try {
      setBusy(true);
      setError(null);

      await dismissMaintenanceSuggestion({
        vehicleId,
        serviceCode,
        reason: "completed_previously",
      });

      setItems((prev) => prev.filter((item) => item.code !== serviceCode));
      setSelected((prev) => {
        const next = { ...prev };
        delete next[serviceCode];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to dismiss suggestion.");
    } finally {
      setBusy(false);
    }
  }

  if (!vehicleId) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">
            Maintenance suggestions
          </div>
          <div className="mt-1 text-sm text-neutral-300">
            Add maintenance items into the pending approval quote flow before work begins.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toggleAll(true)}
            disabled={!items.length || busy}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-200 disabled:opacity-50"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => toggleAll(false)}
            disabled={!items.length || busy}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-200 disabled:opacity-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => void addSelected()}
            disabled={!selectedCodes.length || busy}
            className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50"
          >
            {busy ? "Adding..." : `Add selected (${selectedCodes.length})`}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 text-sm text-neutral-400">Loading suggestions...</div>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-4 text-sm text-neutral-400">
          No active maintenance suggestions.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div key={item.code} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={!!selected[item.code]}
                    onChange={(e) =>
                      setSelected((prev) => ({ ...prev, [item.code]: e.target.checked }))
                    }
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-white">{item.title}</div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-neutral-300">
                        {item.code}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-neutral-400">
                      maintenance • {item.laborHours.toFixed(1)}h
                      {item.priority ? ` • ${item.priority}` : ""}
                    </div>
                    <div className="mt-2 text-sm text-neutral-300">{item.description}</div>
                  </div>
                </label>

                <button
                  type="button"
                  onClick={() => void dismissOne(item.code)}
                  disabled={busy}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-200 disabled:opacity-50"
                >
                  Mark done elsewhere
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
