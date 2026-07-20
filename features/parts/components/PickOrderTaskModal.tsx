"use client";

import Link from "next/link";
import {
  CheckCircle2,
  CircleX,
  Loader2,
  PackageCheck,
  ShoppingCart,
  Warehouse,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/components/ui/dialog";

type PickStock = {
  locationId: string;
  locationLabel: string;
  available: number;
  onHand: number;
  reserved: number;
};

type PickTaskItem = {
  id: string;
  requestId: string;
  workOrderLineId: string | null;
  partId: string | null;
  description: string;
  partNumber: string | null;
  status: string;
  poId: string | null;
  required: number;
  ordered: number;
  received: number;
  staged: number;
  remainingToStage: number;
  stock: PickStock[];
};

type PickTaskResponse = {
  ok: boolean;
  error?: string;
  workOrder?: { id: string; custom_id: string | null };
  items?: PickTaskItem[];
  summary?: {
    itemCount: number;
    pickableCount: number;
    orderedCount: number;
  };
};

type Props = {
  open: boolean;
  workOrderId: string | null;
  workOrderLabel: string;
  customerName?: string | null;
  vehicleLabel?: string | null;
  onClose: () => void;
  onChanged?: () => Promise<void> | void;
};

function qty(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export default function PickOrderTaskModal({
  open,
  workOrderId,
  workOrderLabel,
  customerName,
  vehicleLabel,
  onClose,
  onChanged,
}: Props): JSX.Element {
  const [items, setItems] = useState<PickTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [batchPicking, setBatchPicking] = useState(false);

  const load = useCallback(async () => {
    if (!open || !workOrderId) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/parts/requests/pick-task?workOrderId=${encodeURIComponent(workOrderId)}`,
        { cache: "no-store" },
      );
      const payload = (await response
        .json()
        .catch(() => null)) as PickTaskResponse | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error || "Unable to load the Pick / Order task.",
        );
      }
      setItems(payload.items ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load the Pick / Order task.",
      );
    } finally {
      setLoading(false);
    }
  }, [open, workOrderId]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const detailHref = `/parts/requests/${encodeURIComponent(
    workOrderLabel || workOrderId || "",
  )}`;

  const pickable = useMemo(
    () =>
      items.filter(
        (item) =>
          item.remainingToStage > 0 &&
          item.stock.some((stock) => stock.available > 0),
      ),
    [items],
  );

  const duplicateItemIds = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const item of items) {
      if (!item.partId || !item.workOrderLineId) continue;
      const key = `${item.workOrderLineId}:${item.partId}`;
      grouped.set(key, [...(grouped.get(key) ?? []), item.id]);
    }
    return new Set(
      [...grouped.values()]
        .filter((ids) => ids.length > 1)
        .flat(),
    );
  }, [items]);

  const allocate = useCallback(
    async (item: PickTaskItem, stock: PickStock, amount: number) => {
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch(
        `/api/parts/requests/items/${encodeURIComponent(item.id)}/allocate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            locationId: stock.locationId,
            qty: amount,
            idempotencyKey,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          payload?.error || `Could not pick ${item.description}.`,
        );
      }
    },
    [],
  );

  const pickOne = useCallback(
    async (item: PickTaskItem, stock: PickStock) => {
      if (busyItemId || batchPicking) return;
      const amount = Math.min(item.remainingToStage, stock.available);
      if (amount <= 0) return;
      setBusyItemId(item.id);
      const toastId = toast.loading(`Picking ${item.description}…`);
      try {
        await allocate(item, stock, amount);
        toast.success(`${qty(amount)} picked from ${stock.locationLabel}.`, {
          id: toastId,
        });
        await load();
        await onChanged?.();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not pick this part.",
          { id: toastId },
        );
      } finally {
        setBusyItemId(null);
      }
    },
    [allocate, batchPicking, busyItemId, load, onChanged],
  );

  const dismissDuplicate = useCallback(
    async (item: PickTaskItem) => {
      if (busyItemId || batchPicking) return;
      if (
        !window.confirm(
          `Dismiss the duplicate request for ${item.description}?`,
        )
      ) {
        return;
      }

      setBusyItemId(item.id);
      const toastId = toast.loading(`Dismissing ${item.description}…`);
      try {
        const key = crypto.randomUUID();
        const response = await fetch(
          `/api/parts/requests/items/${encodeURIComponent(item.id)}/cancel`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": key,
            },
            body: JSON.stringify({ idempotencyKey: key }),
          },
        );
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(
            payload?.error || `Could not dismiss ${item.description}.`,
          );
        }
        toast.success("Duplicate request dismissed.", { id: toastId });
        await load();
        await onChanged?.();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not dismiss the duplicate request.",
          { id: toastId },
        );
      } finally {
        setBusyItemId(null);
      }
    },
    [batchPicking, busyItemId, load, onChanged],
  );

  const pickAllAvailable = useCallback(async () => {
    if (batchPicking || busyItemId || pickable.length === 0) return;
    setBatchPicking(true);
    const toastId = toast.loading("Picking all available stock…");
    let pickedCount = 0;
    try {
      for (const item of pickable) {
        let remaining = item.remainingToStage;
        for (const stock of item.stock) {
          if (remaining <= 0) break;
          const amount = Math.min(remaining, stock.available);
          if (amount <= 0) continue;
          await allocate(item, stock, amount);
          remaining -= amount;
          pickedCount += 1;
        }
      }
      toast.success(
        pickedCount > 0
          ? "Available stock was picked and staged."
          : "No available stock could be picked.",
        { id: toastId },
      );
      await load();
      await onChanged?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not finish the batch pick.",
        { id: toastId },
      );
      await load();
      await onChanged?.();
    } finally {
      setBatchPicking(false);
    }
  }, [allocate, batchPicking, busyItemId, load, onChanged, pickable]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] min-h-0 max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="relative shrink-0 px-5 py-4 pr-14">
          <DialogTitle className="flex items-center gap-2 text-base normal-case tracking-normal">
            <PackageCheck className="h-5 w-5 text-sky-300" />
            Pick / Order task · {workOrderLabel}
          </DialogTitle>
          <DialogDescription>
            {[customerName, vehicleLabel].filter(Boolean).join(" · ") ||
              "Approved parts fulfillment"}
          </DialogDescription>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Pick / Order task"
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-5 py-3">
          <div className="text-xs text-[color:var(--theme-text-secondary)]">
            Pick stock first. Order only the remaining shortage. Receiving is
            reserved for actual PO quantities.
          </div>
          <button
            type="button"
            onClick={() => void pickAllAvailable()}
            disabled={
              loading ||
              batchPicking ||
              busyItemId !== null ||
              pickable.length === 0
            }
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-emerald-400/45 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
          >
            {batchPicking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Warehouse className="h-4 w-4" />
            )}
            Pick all available
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-[color:var(--theme-text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading live stock…
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-8 text-center text-sm text-[color:var(--theme-text-secondary)]">
              No approved parts are waiting for this work order.
            </div>
          ) : (
            items.map((item) => {
              const bestStock = item.stock.find((stock) => stock.available > 0);
              const waitingReceipt = item.ordered > item.received;
              const complete = item.remainingToStage <= 0;
              const pickQty = bestStock
                ? Math.min(item.remainingToStage, bestStock.available)
                : 0;
              const canDismissDuplicate =
                duplicateItemIds.has(item.id) &&
                item.ordered <= 0 &&
                item.received <= 0 &&
                item.staged <= 0;
              return (
                <article
                  key={item.id}
                  className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3.5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold text-[color:var(--theme-text-primary)]">
                        {item.description}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                        {item.partNumber ? `${item.partNumber} · ` : ""}
                        Required {qty(item.required)} · Staged{" "}
                        {qty(item.staged)}
                        {item.ordered > 0
                          ? ` · Ordered ${qty(item.ordered)}`
                          : ""}
                        {item.received > 0
                          ? ` · Received ${qty(item.received)}`
                          : ""}
                      </div>
                      {bestStock ? (
                        <div className="mt-2 text-xs text-emerald-200">
                          {qty(bestStock.available)} available at{" "}
                          {bestStock.locationLabel}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                      {canDismissDuplicate ? (
                        <button
                          type="button"
                          onClick={() => void dismissDuplicate(item)}
                          disabled={
                            batchPicking ||
                            (busyItemId !== null && busyItemId !== item.id)
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/45 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 disabled:opacity-50"
                        >
                          {busyItemId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CircleX className="h-4 w-4" />
                          )}
                          Dismiss duplicate
                        </button>
                      ) : null}
                      {complete ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100">
                          <CheckCircle2 className="h-4 w-4" /> Picked / staged
                        </span>
                      ) : !item.partId ? (
                        <Link
                          href={detailHref}
                          className="rounded-lg border border-amber-400/45 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100"
                        >
                          Attach inventory
                        </Link>
                      ) : bestStock ? (
                        <button
                          type="button"
                          onClick={() => void pickOne(item, bestStock)}
                          disabled={
                            batchPicking ||
                            (busyItemId !== null && busyItemId !== item.id)
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/45 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
                        >
                          {busyItemId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Warehouse className="h-4 w-4" />
                          )}
                          Pick {qty(pickQty)}
                        </button>
                      ) : waitingReceipt ? (
                        <Link
                          href="/parts/receiving"
                          className="rounded-lg border border-sky-400/45 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100"
                        >
                          Ordered · receive
                        </Link>
                      ) : (
                        <Link
                          href={detailHref}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/45 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100"
                        >
                          <ShoppingCart className="h-4 w-4" /> Order shortage
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-5 py-3">
          <Link
            href={detailHref}
            className="text-xs font-semibold text-sky-200 hover:text-sky-100"
          >
            Open full request workbench →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[color:var(--theme-border-soft)] px-4 py-2 text-xs font-semibold"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
