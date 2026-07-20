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

type AddBundleResponse = {
  ok?: boolean;
  added?: Array<{ serviceCode: string }>;
  skipped?: Array<{ serviceCode: string; error: string }>;
  error?: string;
};

type Props = {
  workOrderId: string | null;
  vehicleId: string | null;
  enabled: boolean;
  selectedServiceCodes: string[];
  onChange: (codes: string[]) => void;
  onAdded?: () => void | Promise<void>;
};

export default function CreateFlowMaintenanceSelector({
  workOrderId,
  vehicleId,
  enabled,
  selectedServiceCodes,
  onChange,
  onAdded,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const canLoad = enabled && (!!workOrderId || !!vehicleId);

  const load = useCallback(async () => {
    if (!canLoad) {
      setRows([]);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = workOrderId ? { workOrderId } : { vehicleId };

      const res = await fetch("/api/maintenance/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
  }, [canLoad, workOrderId, vehicleId]);

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

  async function addSelectedToQuote() {
    if (!workOrderId || selectedServiceCodes.length === 0 || adding) return;

    try {
      setAdding(true);
      setError(null);
      setNotice(null);

      const res = await fetch("/api/work-orders/maintenance-suggestions/add-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          workOrderId,
          serviceCodes: selectedServiceCodes,
        }),
      });

      const json = (await res.json().catch(() => null)) as AddBundleResponse | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to add maintenance items to the quote.");
      }

      const addedCodes = new Set(
        (json.added ?? []).map((item) => item.serviceCode.trim().toUpperCase()),
      );
      const skipped = json.skipped ?? [];

      if (addedCodes.size === 0) {
        throw new Error(
          skipped.map((item) => item.error).filter(Boolean).join("; ") ||
            "No maintenance items were added.",
        );
      }

      setRows((current) =>
        current.filter(
          (row) => !addedCodes.has(row.serviceCode.trim().toUpperCase()),
        ),
      );
      onChange(
        selectedServiceCodes.filter(
          (code) => !addedCodes.has(code.trim().toUpperCase()),
        ),
      );
      setNotice(
        `${addedCodes.size} maintenance item${addedCodes.size === 1 ? "" : "s"} added to the quote for approval.`,
      );

      if (skipped.length > 0) {
        setError(
          `Some items were skipped: ${skipped
            .map((item) => `${item.serviceCode}: ${item.error}`)
            .join("; ")}`,
        );
      }

      await onAdded?.();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to add maintenance items to the quote.",
      );
    } finally {
      setAdding(false);
    }
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

  const softButtonClass =
    "rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_80%,_var(--theme-surface-page))] disabled:opacity-50";
  const itemPanelClass =
    "rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-3";

  return (
    <section className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-4 shadow-[var(--theme-shadow-medium)] sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-[color:var(--theme-border-soft)] pb-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
            Scheduled maintenance suggestions
          </h2>
          <p className="mt-1 text-[11px] text-[color:var(--theme-text-muted)]">
            History-aware scheduled maintenance due for this vehicle. Selected items will be added after submit as pending approval items.
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">
            Separate lane from menu-items catalog and inspection-template quick add
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setReloadKey((v) => v + 1)}
            disabled={!canLoad || loading}
            className={softButtonClass}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => toggleAll(true)}
            disabled={!rows.length}
            className={softButtonClass}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => toggleAll(false)}
            disabled={!rows.length || adding}
            className={softButtonClass}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => void addSelectedToQuote()}
            disabled={!workOrderId || selectedServiceCodes.length === 0 || adding}
            title={!workOrderId ? "Save & Continue before adding items to the quote." : undefined}
            className="rounded-full border border-[color:var(--copper,#C57A4A)]/70 bg-[color:var(--copper,#C57A4A)]/12 px-3 py-1.5 text-xs font-semibold text-[color:var(--copper,#C57A4A)] hover:bg-[color:var(--copper,#C57A4A)]/18 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {adding
              ? "Adding..."
              : `Add to quote (${selectedServiceCodes.length})`}
          </button>
        </div>
      </div>

      {notice ? (
        <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {notice}
        </div>
      ) : null}

      {!workOrderId && selectedServiceCodes.length > 0 ? (
        <div className="mb-3 text-xs text-[color:var(--theme-text-muted)]">
          Save &amp; Continue first, then add the selected items to the quote.
        </div>
      ) : null}

      {!canLoad ? (
        <div className="rounded-xl border border-dashed border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-4 text-sm text-[color:var(--theme-text-secondary)]">
          Save customer and vehicle first to load maintenance suggestions.
        </div>
      ) : error ? (
        <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : loading ? (
        <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading suggestions...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-4 text-sm text-[color:var(--theme-text-secondary)]">
          No active maintenance suggestions for this vehicle.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((item) => {
            const checked = selectedSet.has(item.serviceCode);
            return (
              <div
                key={item.serviceCode}
                className={itemPanelClass}
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
                        <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{item.label}</div>
                        <span className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                          {item.serviceCode}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                        maintenance
                        {typeof item.laborHours === "number" ? ` • ${item.laborHours.toFixed(1)}h` : ""}
                        {item.priority ? ` • ${item.priority}` : ""}
                      </div>

                      {item.description ? (
                        <div className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">{item.description}</div>
                      ) : null}
                    </div>
                  </label>

                  <button
                    type="button"
                    onClick={() => void dismissCompletedPreviously(item.serviceCode)}
                    disabled={!!busyCode}
                    className={softButtonClass}
                  >
                    {busyCode === item.serviceCode ? "Saving..." : "Mark done elsewhere"}
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
