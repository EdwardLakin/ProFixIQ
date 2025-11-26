"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type JobType = "diagnosis" | "repair" | "maintenance" | "tech-suggested";

type RawSuggestion = any;

type Suggestion = {
  serviceCode: string | null;
  label: string;
  jobType: JobType;
  laborHours: number | null;
  notes: string;
  isCritical: boolean;
  distanceKmNormal: number | null;
  timeMonthsNormal: number | null;
};

type Props = {
  workOrderId: string;
  vehicleId: string | null;
  odometerKm: number | null;
  onAdded?: () => void | Promise<void>;
};

function normalizeSuggestions(input: unknown): Suggestion[] {
  if (!Array.isArray(input)) return [];

  const validJobTypes: JobType[] = [
    "diagnosis",
    "repair",
    "maintenance",
    "tech-suggested",
  ];

  return input.map((raw: RawSuggestion): Suggestion => {
    const serviceCodeRaw =
      typeof raw?.serviceCode === "string" && raw.serviceCode.trim()
        ? raw.serviceCode.trim().toUpperCase()
        : null;

    const labelRaw =
      typeof raw?.label === "string" && raw.label.trim()
        ? raw.label.trim()
        : typeof raw?.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : "Maintenance item";

    const jobTypeRaw =
      typeof raw?.jobType === "string" ? raw.jobType.trim().toLowerCase() : "";
    const jobType: JobType = validJobTypes.includes(jobTypeRaw as JobType)
      ? (jobTypeRaw as JobType)
      : "maintenance";

    const hoursRaw =
      typeof raw?.default_labor_hours === "number"
        ? raw.default_labor_hours
        : typeof raw?.laborHours === "number"
        ? raw.laborHours
        : typeof raw?.typicalHours === "number"
        ? raw.typicalHours
        : null;

    const notesRaw =
      typeof raw?.default_notes === "string"
        ? raw.default_notes
        : typeof raw?.notes === "string"
        ? raw.notes
        : "";

    const isCritical =
      typeof raw?.is_critical === "boolean"
        ? raw.is_critical
        : typeof raw?.isCritical === "boolean"
        ? raw.isCritical
        : false;

    const numOrNull = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;

    return {
      serviceCode: serviceCodeRaw,
      label: labelRaw,
      jobType,
      laborHours: numOrNull(hoursRaw),
      notes: notesRaw,
      isCritical,
      distanceKmNormal: numOrNull(
        raw?.distance_km_normal ?? raw?.distanceKmNormal,
      ),
      timeMonthsNormal: numOrNull(
        raw?.time_months_normal ?? raw?.timeMonthsNormal,
      ),
    };
  });
}

export function WorkOrderSuggestionsPanel({
  workOrderId,
  vehicleId,
  odometerKm,
  onAdded,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const effectiveOdo = useMemo(() => {
    if (typeof odometerKm === "number" && Number.isFinite(odometerKm)) {
      return odometerKm;
    }
    return null;
  }, [odometerKm]);

  const fetchSuggestions = useCallback(
    async (opts?: { isRefresh?: boolean }) => {
      const isRefresh = opts?.isRefresh ?? false;
      if (!workOrderId) return;

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await fetch("/api/maintenance/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderId }),
        });

        const json = await res.json().catch(() => ({} as any));

        if (!res.ok) {
          throw new Error(json?.error || "Failed to load suggestions");
        }

        const suggestions = normalizeSuggestions(json?.suggestions);
        setItems(suggestions);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load suggestions";
        setError(msg);
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workOrderId],
  );

  useEffect(() => {
    if (workOrderId) {
      void fetchSuggestions();
    }
  }, [workOrderId, fetchSuggestions]);

  async function addToQuote(s: Suggestion) {
    if (!workOrderId) return;
    setAddingKey(s.serviceCode || s.label);
    try {
      const res = await fetch("/api/work-orders/quotes/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          vehicleId: vehicleId ?? null,
          items: [
            {
              description: s.label,
              jobType: s.jobType,
              estLaborHours: s.laborHours ?? 1,
              notes: s.notes,
              // You could also pass serviceCode here if your backend
              // wants to store a link back to maintenance_services.
              serviceCode: s.serviceCode,
            },
          ],
        }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to add quote line");
      }

      toast.success("Maintenance item added to quote");
      await onAdded?.();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to add maintenance quote line";
      toast.error(msg);
    } finally {
      setAddingKey(null);
    }
  }

  const hasItems = items.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card/95 p-4 text-sm text-neutral-200">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-orange-300">
            Maintenance suggestions
          </h2>
          <p className="text-[11px] text-neutral-500">
            Based on this vehicle&apos;s profile and mileage, add items to the
            quote instead of directly to jobs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchSuggestions({ isRefresh: true })}
          disabled={loading || refreshing}
          className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {effectiveOdo !== null && (
        <div className="mb-2 text-[11px] text-neutral-400">
          Odometer:&nbsp;
          <span className="font-mono text-neutral-200">
            {effectiveOdo.toLocaleString()} km
          </span>
        </div>
      )}

      {loading && !hasItems && !error && (
        <div className="mt-2 text-xs text-neutral-400">Loading…</div>
      )}

      {error && (
        <div className="mt-2 rounded border border-red-500/40 bg-red-950/60 p-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {!loading && !error && !hasItems && (
        <div className="mt-2 text-xs text-neutral-400">
          No maintenance suggestions recorded for this work order yet.
        </div>
      )}

      {hasItems && (
        <div className="mt-3 space-y-2">
          {items.map((s) => {
            const key = s.serviceCode || s.label;
            const dueBits: string[] = [];

            if (s.distanceKmNormal != null) {
              dueBits.push(`${s.distanceKmNormal.toLocaleString()} km`);
            }
            if (s.timeMonthsNormal != null) {
              dueBits.push(`${s.timeMonthsNormal} months`);
            }

            return (
              <div
                key={key}
                className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate font-medium text-neutral-50">
                        {s.label}
                      </div>
                      {s.serviceCode && (
                        <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-neutral-300">
                          {s.serviceCode}
                        </span>
                      )}
                      {s.isCritical && (
                        <span className="rounded-full border border-red-700/70 bg-red-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200">
                          Critical
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-400">
                      {s.jobType} •{" "}
                      {typeof s.laborHours === "number"
                        ? `${s.laborHours.toFixed(1)}h`
                        : "Labor TBD"}
                      {dueBits.length > 0 && (
                        <> • Due around: {dueBits.join(" or ")}</>
                      )}
                    </div>
                    {s.notes && (
                      <div className="mt-1 text-[11px] text-neutral-400">
                        {s.notes}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => void addToQuote(s)}
                      disabled={addingKey === key}
                      className="rounded-md border border-blue-600 px-3 py-1 text-[11px] font-medium text-blue-200 hover:bg-blue-900/25 disabled:opacity-60"
                    >
                      {addingKey === key ? "Adding…" : "Add to quote"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}