"use client";

import { useEffect, useState } from "react";
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
  const [pending, setPending] = useState<Record<string, PendingAction>>({});

  useEffect(() => {
    if (!vehicleId) {
      setItems([]);
      setCanViewPricing(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    void fetch(
      `/api/work-orders/deferred-history?vehicleId=${encodeURIComponent(vehicleId)}`,
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
        setCanViewPricing(false);
        setItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [vehicleId, workOrderId]);

  async function handleAdd(item: DeferredItem) {
    setPending((prev) => ({ ...prev, [item.rootLineId]: "add" }));
    try {
      const newLineId = crypto.randomUUID();
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
      setItems((prev) => prev.filter((row) => row.rootLineId !== item.rootLineId));
    } catch {
      toast.error("Could not add this recommendation.");
    } finally {
      setPending((prev) => {
        const next = { ...prev };
        delete next[item.rootLineId];
        return next;
      });
    }
  }

  async function handleDecline(item: DeferredItem) {
    setPending((prev) => ({ ...prev, [item.rootLineId]: "decline" }));
    try {
      const actionId = crypto.randomUUID();
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
      setItems((prev) => prev.filter((row) => row.rootLineId !== item.rootLineId));
    } catch {
      toast.error("Could not record the decline.");
    } finally {
      setPending((prev) => {
        const next = { ...prev };
        delete next[item.rootLineId];
        return next;
      });
    }
  }

  async function handleResolveElsewhere(item: DeferredItem) {
    setPending((prev) => ({ ...prev, [item.rootLineId]: "resolve" }));
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
      setItems((prev) => prev.filter((row) => row.rootLineId !== item.rootLineId));
    } catch {
      toast.error("Could not resolve this recommendation.");
    } finally {
      setPending((prev) => {
        const next = { ...prev };
        delete next[item.rootLineId];
        return next;
      });
    }
  }

  if (!vehicleId || (!loading && items.length === 0)) return null;

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

      {loading && items.length === 0 ? (
        <div className="mt-3 text-sm text-[color:var(--theme-text-muted)]">
          Checking previous recommendations…
        </div>
      ) : (
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {items.map((item) => {
            const itemPending = pending[item.rootLineId] ?? null;
            const busy = itemPending !== null;

            return (
              <article
                key={item.rootLineId}
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
