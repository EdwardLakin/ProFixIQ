"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@shared/components/ui/Button";
import type { MaintenanceSuggestionItem } from "@/features/maintenance/server/types";

type Props = {
  workOrderId?: string | null;
  className?: string;
};

type SuggestionsResponse =
  | {
      ok: true;
      workOrderId: string;
      suggestions: MaintenanceSuggestionItem[];
    }
  | {
      ok: false;
      error?: string;
    };

function formatKm(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString()} km`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function getBadgeTone(item: MaintenanceSuggestionItem): string {
  if (item.isCritical) {
    return "border-red-500/40 bg-red-500/10 text-red-300";
  }
  if (item.overdue) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
}

export default function MaintenanceSuggestionsCard({
  workOrderId,
  className,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const resolvedWorkOrderId = useMemo(() => {
    const explicit = workOrderId?.trim();
    if (explicit) return explicit;

    const fromQuery = searchParams.get("workOrderId")?.trim();
    if (fromQuery) return fromQuery;

    return null;
  }, [workOrderId, searchParams]);

  const [loading, setLoading] = useState(false);
  const [addingServiceCode, setAddingServiceCode] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MaintenanceSuggestionItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadSuggestions = useCallback(async () => {
    if (!resolvedWorkOrderId) {
      setSuggestions([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/work-orders/maintenance-suggestions?workOrderId=${encodeURIComponent(
          resolvedWorkOrderId,
        )}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const json = (await res.json()) as SuggestionsResponse;

      if (!res.ok || !("ok" in json) || !json.ok) {
        throw new Error(("error" in json && json.error) || "Failed to load maintenance suggestions");
      }

      setSuggestions(Array.isArray(json.suggestions) ? json.suggestions : []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load maintenance suggestions";
      setError(message);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [resolvedWorkOrderId]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  async function handleAdd(serviceCode: string) {
    if (!resolvedWorkOrderId) return;

    setAddingServiceCode(serviceCode);
    setError(null);

    try {
      const res = await fetch("/api/work-orders/maintenance-suggestions/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workOrderId: resolvedWorkOrderId,
          serviceCode,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; addedLineId?: string; error?: string }
        | null;

      if (!res.ok) {
        throw new Error(json?.error || "Failed to add maintenance line");
      }

      await loadSuggestions();
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add maintenance line";
      setError(message);
    } finally {
      setAddingServiceCode(null);
    }
  }

  return (
    <section
      className={[
        "rounded-2xl border border-white/10 bg-black/30 p-4 text-white shadow-card backdrop-blur-md",
        className ?? "",
      ].join(" ")}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-200">
            Maintenance Upsell
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            History-aware maintenance due now for this vehicle.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadSuggestions()}
          disabled={loading || !resolvedWorkOrderId}
          className="border-white/15 bg-white/5 text-xs text-neutral-200 hover:bg-white/10"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {!resolvedWorkOrderId ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-4 text-xs text-neutral-400">
          Save the work order first, or load this page with a <span className="font-semibold text-neutral-200">workOrderId</span>,
          then maintenance suggestions will appear here.
        </div>
      ) : null}

      {resolvedWorkOrderId && error ? (
        <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      {resolvedWorkOrderId && !loading && !error && suggestions.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-xs text-neutral-400">
          No due maintenance suggestions right now.
        </div>
      ) : null}

      {resolvedWorkOrderId && suggestions.length > 0 ? (
        <div className="space-y-3">
          {suggestions.map((item) => {
            const isAdding = addingServiceCode === item.serviceCode;

            return (
              <div
                key={item.serviceCode}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-neutral-100">
                        {item.label}
                      </div>

                      <span
                        className={[
                          "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          getBadgeTone(item),
                        ].join(" ")}
                      >
                        {item.isCritical ? "Critical" : item.overdue ? "Overdue" : "Due"}
                      </span>

                      <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                        {item.serviceCode}
                      </span>

                      {item.menuItemId ? (
                        <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sky-200">
                          mapped menu
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 grid gap-2 text-xs text-neutral-400 md:grid-cols-2">
                      <div>
                        <span className="text-neutral-500">Last completed:</span>{" "}
                        <span className="text-neutral-300">{formatDate(item.lastCompletedAt)}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500">Last mileage:</span>{" "}
                        <span className="text-neutral-300">{formatKm(item.lastCompletedMileageKm)}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500">Current mileage:</span>{" "}
                        <span className="text-neutral-300">{formatKm(item.currentMileageKm)}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500">Trigger mileage:</span>{" "}
                        <span className="text-neutral-300">{formatKm(item.triggerMileageKm)}</span>
                      </div>
                    </div>

                    {item.notes ? (
                      <p className="mt-2 text-xs text-neutral-300">{item.notes}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleAdd(item.serviceCode)}
                      disabled={isAdding}
                      className="bg-orange-500 text-black hover:bg-orange-400"
                    >
                      {isAdding ? "Adding..." : "Add to work order"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
