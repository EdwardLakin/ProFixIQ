"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SuggestionRow = {
  serviceCode: string;
  label: string;
  description?: string | null;
  laborHours?: number | null;
  priority?: string | null;
  suppressed?: boolean;
};

type SuggestionsResponse = {
  ok?: boolean;
  suggestions?: SuggestionRow[];
};

type Props = {
  vehicleId: string | null;
  enabled: boolean;
  selectedServiceCodes: string[];
  onChange: (codes: string[]) => void;
};

export default function CreateFlowMaintenanceSelector({
  vehicleId,
  enabled,
  selectedServiceCodes,
  onChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const canLoad = enabled && !!vehicleId;

  const load = useCallback(async () => {
    if (!canLoad || !vehicleId) {
      setRows([]);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/maintenance/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId }),
        cache: "no-store",
      });

      const json = (await res.json().catch(() => null)) as SuggestionsResponse | null;

      if (!res.ok) {
        throw new Error("Failed to load maintenance suggestions.");
      }

      const next = Array.isArray(json?.suggestions)
        ? json!.suggestions.filter((item) => !item?.suppressed)
        : [];

      setRows(next);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Failed to load maintenance suggestions.");
    } finally {
      setLoading(false);
    }
  }, [canLoad, vehicleId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const selectedSet = useMemo(() => new Set(selectedServiceCodes), [selectedServiceCodes]);

  function toggle(code: string, checked: boolean) {
    const next = new Set(selectedSet);
    if (checked) next.add(code);
    else next.delete(code);
    onChange(Array.from(next));
  }

  function toggleAll(nextChecked: boolean) {
    if (!rows.length) return;
    onChange(nextChecked ? rows.map((row) => row.serviceCode) : []);
  }

  async function dismissCompletedPreviously(serviceCode: string) {
    if (!vehicleId || busyCode) return;

    try {
      setBusyCode(serviceCode);
      setError(null);

      const res = await fetch("/api/maintenance/suggestions/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId,
          serviceCode,
          reason: "completed_previously",
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to dismiss suggestion.");
      }

      const nextRows = rows.filter((row) => row.serviceCode !== serviceCode);
      setRows(nextRows);
      onChange(selectedServiceCodes.filter((code) => code !== serviceCode));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to dismiss suggestion.");
    } finally {
      setBusyCode(null);
    }
  }

  if (!enabled) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-black/50 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.55)] sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-300">
            Maintenance suggestions
          </h2>
          <p className="mt-1 text-[11px] text-neutral-500">
            Select recommended services now. They’ll be added after submit as pending approval items.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setReloadKey((v) => v + 1)}
            disabled={!canLoad || loading}
            className="rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-black/65 disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => toggleAll(true)}
            disabled={!rows.length}
            className="rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-black/65 disabled:opacity-50"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => toggleAll(false)}
            disabled={!rows.length}
            className="rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-black/65 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>

      {!canLoad ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-4 text-sm text-neutral-400">
          Save customer and vehicle first to load maintenance suggestions.
        </div>
      ) : error ? (
        <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : loading ? (
        <div className="text-sm text-neutral-400">Loading suggestions...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-4 text-sm text-neutral-400">
          No active maintenance suggestions for this vehicle.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((item) => {
            const checked = selectedSet.has(item.serviceCode);
            return (
              <div
                key={item.serviceCode}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <label className="flex min-w-0 flex-1 items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggle(item.serviceCode, e.target.checked)}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-white">{item.label}</div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-neutral-300">
                          {item.serviceCode}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-neutral-400">
                        maintenance
                        {typeof item.laborHours === "number" ? ` • ${item.laborHours.toFixed(1)}h` : ""}
                        {item.priority ? ` • ${item.priority}` : ""}
                      </div>

                      {item.description ? (
                        <div className="mt-2 text-sm text-neutral-300">{item.description}</div>
                      ) : null}
                    </div>
                  </label>

                  <button
                    type="button"
                    onClick={() => void dismissCompletedPreviously(item.serviceCode)}
                    disabled={!!busyCode}
                    className="rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-black/65 disabled:opacity-50"
                  >
                    {busyCode === item.serviceCode ? "Saving..." : "Completed previously"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
