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

function bucketTitle(bucket: MaintenanceSuggestionItem["advisorBucket"]): string {
  if (bucket === "urgent") return "🔥 Urgent";
  if (bucket === "bundle") return "🧾 Maintenance Bundle";
  return "⚠️ Due Soon";
}

function bundleTitle(bundleKey: string | null): string {
  if (bundleKey === "pm_service") return "Preventive Maintenance Package";
  if (bundleKey === "tire_service") return "Tire Service Package";
  if (bundleKey === "brake_service") return "Brake Service Package";
  if (bundleKey === "fluid_service") return "Fluid Service Package";
  return "Maintenance Bundle";
}

function sumLaborHours(items: MaintenanceSuggestionItem[]): number {
  return items.reduce((sum, item) => sum + (item.laborHours ?? 0), 0);
}

function sumEffectivePrice(items: MaintenanceSuggestionItem[]): number {
  return items.reduce((sum, item) => sum + (item.effectivePrice ?? 0), 0);
}

function countMapped(items: MaintenanceSuggestionItem[]): number {
  return items.filter((item) => Boolean(item.menuItemId)).length;
}


function getSelectedBundleItems(
  items: MaintenanceSuggestionItem[],
  selectedCodes: Record<string, boolean>,
  bundleKey: string | null,
): MaintenanceSuggestionItem[] {
  if (!bundleKey) return [];
  return items.filter(
    (item) => item.bundleKey === bundleKey && Boolean(selectedCodes[item.serviceCode]),
  );
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
  const [addingBundleKey, setAddingBundleKey] = useState<string | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<Record<string, boolean>>({});
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

  useEffect(() => {
    setSelectedCodes((prev) => {
      const next: Record<string, boolean> = {};
      for (const item of suggestions) {
        if (prev[item.serviceCode]) next[item.serviceCode] = true;
      }
      return next;
    });
  }, [suggestions]);


  async function handleAddBundle(bundleKey: string) {
    if (!resolvedWorkOrderId) return;

    const bundleItems = suggestions.filter(
      (item) => item.bundleKey === bundleKey,
    );

    if (bundleItems.length === 0) return;

    setAddingBundleKey(bundleKey);
    setError(null);

    try {
      const res = await fetch("/api/work-orders/maintenance-suggestions/add-bundle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workOrderId: resolvedWorkOrderId,
          serviceCodes: bundleItems.map((item) => item.serviceCode),
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            added?: Array<{ serviceCode: string }>;
            skipped?: Array<{ serviceCode: string; error: string }>;
            error?: string;
          }
        | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to add maintenance bundle");
      }

      await loadSuggestions();
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add maintenance bundle";
      setError(message);
    } finally {
      setAddingBundleKey(null);
    }
  }

  async function handleAddSelected(bundleKey: string) {
    if (!resolvedWorkOrderId) return;

    const bundleItems = suggestions.filter(
      (item) => item.bundleKey === bundleKey && selectedCodes[item.serviceCode],
    );

    if (bundleItems.length === 0) {
      setError("Select at least one bundle item first");
      return;
    }

    setAddingBundleKey(bundleKey);
    setError(null);

    try {
      const res = await fetch("/api/work-orders/maintenance-suggestions/add-bundle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workOrderId: resolvedWorkOrderId,
          serviceCodes: bundleItems.map((item) => item.serviceCode),
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
          }
        | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to add selected bundle items");
      }

      await loadSuggestions();
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add selected bundle items";
      setError(message);
    } finally {
      setAddingBundleKey(null);
    }
  }

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
        "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-[color:var(--theme-text-primary)] shadow-card backdrop-blur-md",
        className ?? "",
      ].join(" ")}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-primary)]">
            Maintenance Upsell
          </h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            History-aware maintenance due now for this vehicle.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadSuggestions()}
          disabled={loading || !resolvedWorkOrderId}
          className="border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-xs text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {!resolvedWorkOrderId ? (
        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-4 text-xs text-[color:var(--theme-text-secondary)]">
          Save the work order first, or load this page with a <span className="font-semibold text-[color:var(--theme-text-primary)]">workOrderId</span>,
          then maintenance suggestions will appear here.
        </div>
      ) : null}

      {resolvedWorkOrderId && error ? (
        <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      {resolvedWorkOrderId && !loading && !error && suggestions.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-4 text-xs text-[color:var(--theme-text-secondary)]">
          No due maintenance suggestions right now.
        </div>
      ) : null}

      {resolvedWorkOrderId && suggestions.length > 0 ? (
        <div className="space-y-5">
          {(["urgent", "due_soon", "bundle"] as const)
            .map((bucket) => ({
              bucket,
              items: suggestions.filter((item) => item.advisorBucket === bucket),
            }))
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <div key={group.bucket} className="space-y-3">
                <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                        {group.bucket === "bundle"
                          ? bundleTitle(group.items.find((item) => item.bundleKey)?.bundleKey ?? null)
                          : bucketTitle(group.bucket)}
                      </div>

                      {group.bucket === "bundle" ? (
                        <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                          {group.items.length} items • {sumLaborHours(group.items).toFixed(1)} labor hrs • ${sumEffectivePrice(group.items).toLocaleString()}
                        </div>
                      ) : null}
                    </div>

                    {group.bucket === "bundle" ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const firstBundleKey =
                              group.items.find((item) => item.bundleKey)?.bundleKey ?? null;
                            if (firstBundleKey) {
                              void handleAddBundle(firstBundleKey);
                            }
                          }}
                          disabled={
                            addingBundleKey ===
                            (group.items.find((item) => item.bundleKey)?.bundleKey ?? null)
                          }
                          className="border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-xs text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
                        >
                          {addingBundleKey ===
                          (group.items.find((item) => item.bundleKey)?.bundleKey ?? null)
                            ? "Adding bundle..."
                            : "Add full bundle"}
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            const firstBundleKey =
                              group.items.find((item) => item.bundleKey)?.bundleKey ?? null;
                            if (firstBundleKey) {
                              void handleAddSelected(firstBundleKey);
                            }
                          }}
                          disabled={
                            addingBundleKey ===
                            (group.items.find((item) => item.bundleKey)?.bundleKey ?? null)
                          }
                          className="bg-orange-500 text-[color:var(--theme-text-on-accent)] hover:bg-orange-400"
                        >
                          {addingBundleKey ===
                          (group.items.find((item) => item.bundleKey)?.bundleKey ?? null)
                            ? "Adding..."
                            : "Add selected"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {group.bucket === "bundle" &&
                (() => {
                  const bundleKey =
                    group.items.find((item) => item.bundleKey)?.bundleKey ?? null;
                  const selectedItems = getSelectedBundleItems(
                    group.items,
                    selectedCodes,
                    bundleKey,
                  );

                  if (selectedItems.length === 0) return null;

                  return (
                    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-200">
                        Selected bundle summary
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-[color:var(--theme-text-secondary)] md:grid-cols-2">
                        <div>
                          <span className="text-[color:var(--theme-text-muted)]">Selected items:</span>{" "}
                          {selectedItems.length}
                        </div>
                        <div>
                          <span className="text-[color:var(--theme-text-muted)]">Mapped items:</span>{" "}
                          {countMapped(selectedItems)}
                        </div>
                        <div>
                          <span className="text-[color:var(--theme-text-muted)]">Labor:</span>{" "}
                          {sumLaborHours(selectedItems).toFixed(1)} hrs
                        </div>
                        <div>
                          <span className="text-[color:var(--theme-text-muted)]">Total:</span>{" "}
                          ${sumEffectivePrice(selectedItems).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {group.items.map((item) => {
                  const isAdding = addingServiceCode === item.serviceCode;

                  return (
                    <div
                      key={item.serviceCode}
                      className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                          {group.bucket === "bundle" ? (
                            <label className="mb-2 flex items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]">
                              <input
                                type="checkbox"
                                checked={Boolean(selectedCodes[item.serviceCode])}
                                onChange={(e) =>
                                  setSelectedCodes((prev) => ({
                                    ...prev,
                                    [item.serviceCode]: e.target.checked,
                                  }))
                                }
                              />
                              Select for package
                            </label>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
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

                            <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                              {item.serviceCode}
                            </span>

                            {item.menuItemId ? (
                              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sky-200">
                                mapped menu
                              </span>
                            ) : null}

                            <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                              priority {item.advisorPriority}
                            </span>
                          </div>

                          <div className="mt-2 grid gap-2 text-xs text-[color:var(--theme-text-secondary)] md:grid-cols-2">
                            <div>
                              <span className="text-[color:var(--theme-text-muted)]">Last completed:</span>{" "}
                              <span className="text-[color:var(--theme-text-secondary)]">{formatDate(item.lastCompletedAt)}</span>
                            </div>
                            <div>
                              <span className="text-[color:var(--theme-text-muted)]">Last mileage:</span>{" "}
                              <span className="text-[color:var(--theme-text-secondary)]">{formatKm(item.lastCompletedMileageKm)}</span>
                            </div>
                            <div>
                              <span className="text-[color:var(--theme-text-muted)]">Current mileage:</span>{" "}
                              <span className="text-[color:var(--theme-text-secondary)]">{formatKm(item.currentMileageKm)}</span>
                            </div>
                            <div>
                              <span className="text-[color:var(--theme-text-muted)]">Trigger mileage:</span>{" "}
                              <span className="text-[color:var(--theme-text-secondary)]">{formatKm(item.triggerMileageKm)}</span>
                            </div>
                            <div>
                              <span className="text-[color:var(--theme-text-muted)]">Sell order:</span>{" "}
                              <span className="text-[color:var(--theme-text-secondary)]">{item.sellOrder}</span>
                            </div>
                            <div>
                              <span className="text-[color:var(--theme-text-muted)]">Price:</span>{" "}
                              <span className="text-[color:var(--theme-text-secondary)]">
                                {item.effectivePrice != null
                                  ? `$${item.effectivePrice.toLocaleString()}`
                                  : "—"}
                              </span>
                            </div>
                          </div>

                          {item.menuItemName ? (
                            <p className="mt-2 text-xs text-sky-200">
                              Mapped menu item: {item.menuItemName}
                            </p>
                          ) : null}

                          {item.whyDue ? (
                            <p className="mt-2 text-xs text-amber-200">{item.whyDue}</p>
                          ) : null}

                          {item.notes ? (
                            <p className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">{item.notes}</p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleAdd(item.serviceCode)}
                            disabled={isAdding}
                            className="bg-orange-500 text-[color:var(--theme-text-on-accent)] hover:bg-orange-400"
                          >
                            {isAdding ? "Adding..." : "Add to work order"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
      ) : null}
    </section>
  );
}
