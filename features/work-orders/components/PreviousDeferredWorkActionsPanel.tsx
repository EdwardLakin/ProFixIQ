"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type DeferredItem = {
  rootLineId: string;
  quoteLineId: string;
  actionQuoteLineId: string;
  workOrderId: string | null;
  workOrderNumber: string | null;
  title: string;
  complaint: string | null;
  decision: "declined" | "deferred";
  decisionAt: string;
  laborTotal: number | null;
  partsTotal: number | null;
  taxTotal: number | null;
  grandTotal: number | null;
};

type DeferredPayload = {
  ok?: boolean;
  vehicleId?: string | null;
  canViewPricing?: boolean;
  items?: DeferredItem[];
  error?: string;
};

type PendingAction = "add" | "decline" | "resolve" | null;

function money(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Previous visit";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PreviousDeferredWorkActionsPanel({
  workOrderId,
  vehicleId,
}: {
  workOrderId: string;
  vehicleId: string | null | undefined;
}) {
  const [items, setItems] = useState<DeferredItem[]>([]);
  const [canViewPricing, setCanViewPricing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, PendingAction>>({});
  const [reloadNonce, setReloadNonce] = useState(0);
  // One idempotency key per recommendation, generated lazily and reused
  // across retries so a lost response (network error, server 5xx) can be
  // safely retried without inserting a second decline/receipt. Cleared once
  // the action actually succeeds and the item leaves the list.
  const actionIdsRef = useRef<Map<string, string>>(new Map());

  function actionIdFor(key: string): string {
    const existing = actionIdsRef.current.get(key);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    actionIdsRef.current.set(key, generated);
    return generated;
  }

  useEffect(() => {
    if (!vehicleId) {
      setItems([]);
      setCanViewPricing(false);
      setLoadError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    void fetch(
      `/api/work-orders/deferred-history?vehicleId=${encodeURIComponent(vehicleId)}&excludeWorkOrderId=${encodeURIComponent(workOrderId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | DeferredPayload
          | null;
        if (!response.ok || !payload?.ok) {
          throw new Error(
            payload?.error || "Previous deferred work could not be loaded.",
          );
        }
        setCanViewPricing(payload.canViewPricing === true);
        setItems(Array.isArray(payload.items) ? payload.items : []);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Keep whatever was last successfully loaded rather than clearing it:
        // this panel is the sole advisor-facing replacement for automatic
        // carry-forward, so a failed refresh must not look identical to "no
        // unresolved recommendations."
        setLoadError(
          error instanceof Error
            ? error.message
            : "Previous deferred work could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [vehicleId, workOrderId, reloadNonce]);

  const retryLoad = useCallback(() => setReloadNonce((n) => n + 1), []);

  function removeItem(key: string) {
    actionIdsRef.current.delete(key);
    setItems((prev) => prev.filter((row) => row.actionQuoteLineId !== key));
  }

  async function handleAdd(item: DeferredItem) {
    const key = item.actionQuoteLineId;
    setPending((prev) => ({ ...prev, [key]: "add" }));
    try {
      const newLineId = actionIdFor(key);
      const response = await fetch(
        `/api/work-orders/${workOrderId}/deferred-history/add`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": newLineId,
          },
          body: JSON.stringify({
            quoteLineId: item.actionQuoteLineId,
            newLineId,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        toast.error(payload?.error ?? "Could not add this recommendation.");
        return;
      }

      toast.success(`Added "${item.title}" to this work order.`);
      removeItem(key);
    } catch {
      toast.error("Could not add this recommendation.");
    } finally {
      setPending((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleDecline(item: DeferredItem) {
    const key = item.actionQuoteLineId;
    setPending((prev) => ({ ...prev, [key]: "decline" }));
    try {
      const actionId = actionIdFor(key);
      const response = await fetch(
        `/api/work-orders/${workOrderId}/deferred-history/decline`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": actionId,
          },
          body: JSON.stringify({
            quoteLineId: item.actionQuoteLineId,
            actionId,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        toast.error(payload?.error ?? "Could not record the decline.");
        return;
      }

      toast.success(`Recorded a decline for "${item.title}".`);
      removeItem(key);
    } catch {
      toast.error("Could not record the decline.");
    } finally {
      setPending((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleResolveElsewhere(item: DeferredItem) {
    const key = item.actionQuoteLineId;
    setPending((prev) => ({ ...prev, [key]: "resolve" }));
    try {
      const response = await fetch(
        `/api/work-orders/${workOrderId}/deferred-history/resolve-elsewhere`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteLineId: item.actionQuoteLineId }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        toast.error(payload?.error ?? "Could not resolve this recommendation.");
        return;
      }

      toast.success(`Marked "${item.title}" completed elsewhere.`);
      removeItem(key);
    } catch {
      toast.error("Could not resolve this recommendation.");
    } finally {
      setPending((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  if (!vehicleId) return null;
  if (!loading && items.length === 0 && !loadError) return null;

  return (
    <section
      className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-4 shadow-[var(--theme-shadow-medium)]"
      aria-label="Previous deferred work"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Previous deferred work
          </div>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Unresolved recommendations from earlier visits for this vehicle.
            Decide what happens to each one.
          </p>
        </div>
        {items.length > 0 ? (
          <span className="rounded-full border border-[color:var(--desktop-border)] px-3 py-1 text-xs font-semibold text-[color:var(--theme-text-primary)]">
            {items.length} previous {items.length === 1 ? "item" : "items"}
          </span>
        ) : null}
      </div>

      {loadError ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-100">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={retryLoad}
            className="rounded-lg border border-red-500/45 px-3 py-1 text-xs font-semibold transition hover:bg-red-500/15"
          >
            Retry
          </button>
        </div>
      ) : loading && items.length === 0 ? (
        <div className="mt-3 text-sm text-[color:var(--theme-text-muted)]">
          Checking previous recommendations…
        </div>
      ) : (
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {items.map((item) => {
            const key = item.actionQuoteLineId;
            const itemPending = pending[key] ?? null;
            const busy = itemPending !== null;

            return (
              <article
                key={key}
                className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[color:var(--theme-text-primary)]">
                      {item.title}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                      {item.decision === "declined" ? "Declined" : "Deferred"}{" "}
                      {dateLabel(item.decisionAt)}
                      {item.workOrderNumber ? ` · ${item.workOrderNumber}` : ""}
                    </div>
                  </div>
                  {canViewPricing && item.grandTotal != null ? (
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                        Last quoted
                      </div>
                      <div className="text-base font-bold text-[color:var(--theme-text-primary)]">
                        {money(item.grandTotal)}
                      </div>
                    </div>
                  ) : null}
                </div>

                {item.complaint && item.complaint.trim() !== item.title.trim() ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                    {item.complaint}
                  </p>
                ) : null}

                {canViewPricing &&
                item.laborTotal != null &&
                item.partsTotal != null ? (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[color:var(--theme-text-muted)]">
                    <span>Labor {money(item.laborTotal)}</span>
                    <span>Parts {money(item.partsTotal)}</span>
                    {item.taxTotal != null && item.taxTotal > 0 ? (
                      <span>Tax {money(item.taxTotal)}</span>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleAdd(item)}
                    className="rounded-lg border border-emerald-500/45 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/15 disabled:opacity-55 dark:text-emerald-100"
                  >
                    {itemPending === "add" ? "Adding…" : "Add"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDecline(item)}
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/15 disabled:opacity-55 dark:text-amber-100"
                  >
                    {itemPending === "decline" ? "Declining…" : "Decline"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleResolveElsewhere(item)}
                    className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:border-[color:var(--brand-primary,#1747FF)]/60 disabled:opacity-55"
                  >
                    {itemPending === "resolve" ? "Resolving…" : "Completed elsewhere"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
