"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import ReceiveDrawer, {
  type ReceiveDrawerItem,
} from "@/features/parts/components/ReceiveDrawer";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type Lane = "requests" | "approval" | "ordered" | "ready";

type RequestLite = {
  id: string;
  work_order_id: string | null;
  job_id: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
};

type ItemLite = {
  id: string;
  request_id: string;
  work_order_line_id: string | null;
  part_id: string | null;
  description: string | null;
  status: string | null;
  qty: number | null;
  qty_requested: number | null;
  qty_approved: number | null;
  qty_received: number | null;
  qty_consumed: number | null;
  created_at: string | null;
};

type WorkOrderLite = {
  id: string;
  custom_id: string | null;
};

type LocationLite = {
  id: string;
  code: string | null;
  name: string | null;
};

type WorkflowEntry = {
  key: string;
  requestId: string;
  workOrderId: string | null;
  workOrderLineId: string | null;
  workOrderLabel: string;
  itemId: string | null;
  partId: string | null;
  description: string;
  itemStatus: string;
  qtyRequested: number;
  qtyApproved: number;
  qtyReceived: number;
  qtyAllocated: number;
  targetQty: number;
  lane: Lane | "complete";
};

type AllocationDraft = {
  entry: WorkflowEntry;
  locationId: string;
  qty: number;
};

type ApiResult = { ok?: boolean; error?: string };

const ACTIVE_REQUEST_STATUSES = ["requested", "quoted", "approved"] as const;
const CANCELLED_ITEM_STATUSES = new Set([
  "cancelled",
  "canceled",
  "declined",
  "rejected",
]);
const actionClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:border-[color:var(--accent-copper)] disabled:cursor-not-allowed disabled:opacity-50";
const primaryActionClass = `${actionClass} border-[color:var(--accent-copper)] bg-[color:var(--accent-copper)] text-white`;

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveLane(args: {
  requestStatus: string;
  targetQty: number;
  qtyReceived: number;
  qtyAllocated: number;
}): Lane | "complete" {
  if (args.requestStatus === "requested") return "requests";
  if (args.requestStatus === "quoted") return "approval";
  if (args.targetQty <= 0 || args.qtyReceived < args.targetQty) return "ordered";
  if (args.qtyAllocated < args.targetQty) return "ready";
  return "complete";
}

function operationKey(prefix: string, itemId: string): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `mobile-parts:${prefix}:${itemId}:${random}`;
}

function formatQty(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

function laneLabel(lane: Lane): string {
  if (lane === "requests") return "Requests";
  if (lane === "approval") return "Awaiting approval";
  if (lane === "ordered") return "On order / receiving";
  return "Ready for technician";
}

export default function MobilePartsWorkflow(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [lane, setLane] = useState<Lane>("requests");
  const [entries, setEntries] = useState<WorkflowEntry[]>([]);
  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receiveEntry, setReceiveEntry] = useState<WorkflowEntry | null>(null);
  const [allocation, setAllocation] = useState<AllocationDraft | null>(null);
  const [allocating, setAllocating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [requestResult, locationResult] = await Promise.all([
        supabase
          .from("part_requests")
          .select("id, work_order_id, job_id, status, notes, created_at")
          .in("status", [...ACTIVE_REQUEST_STATUSES])
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("stock_locations")
          .select("id, code, name")
          .order("code", { ascending: true }),
      ]);

      if (requestResult.error) throw requestResult.error;
      if (locationResult.error) throw locationResult.error;

      const requests = (requestResult.data ?? []) as RequestLite[];
      const requestIds = requests.map((request) => request.id);
      const workOrderIds = Array.from(
        new Set(
          requests
            .map((request) => request.work_order_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      let items: ItemLite[] = [];
      if (requestIds.length > 0) {
        const itemResult = await supabase
          .from("part_request_items")
          .select(
            "id, request_id, work_order_line_id, part_id, description, status, qty, qty_requested, qty_approved, qty_received, qty_consumed, created_at",
          )
          .in("request_id", requestIds)
          .order("created_at", { ascending: false });
        if (itemResult.error) throw itemResult.error;
        items = (itemResult.data ?? []) as ItemLite[];
      }

      let workOrders: WorkOrderLite[] = [];
      if (workOrderIds.length > 0) {
        const workOrderResult = await supabase
          .from("work_orders")
          .select("id, custom_id")
          .in("id", workOrderIds);
        if (workOrderResult.error) throw workOrderResult.error;
        workOrders = (workOrderResult.data ?? []) as WorkOrderLite[];
      }

      const workOrderById = new Map(
        workOrders.map((workOrder) => [workOrder.id, workOrder]),
      );
      const itemsByRequest = new Map<string, ItemLite[]>();
      for (const item of items) {
        const current = itemsByRequest.get(item.request_id) ?? [];
        current.push(item);
        itemsByRequest.set(item.request_id, current);
      }

      const nextEntries: WorkflowEntry[] = [];
      for (const request of requests) {
        const requestStatus = clean(request.status).toLowerCase();
        const requestItems = itemsByRequest.get(request.id) ?? [];
        const workOrder = request.work_order_id
          ? workOrderById.get(request.work_order_id)
          : null;
        const workOrderLabel =
          clean(workOrder?.custom_id) ||
          (request.work_order_id
            ? `WO ${request.work_order_id.slice(0, 8)}`
            : "Unlinked request");

        if (requestItems.length === 0) {
          nextEntries.push({
            key: `request:${request.id}`,
            requestId: request.id,
            workOrderId: request.work_order_id,
            workOrderLineId: request.job_id,
            workOrderLabel,
            itemId: null,
            partId: null,
            description: clean(request.notes) || "Parts request",
            itemStatus: "No items yet",
            qtyRequested: 0,
            qtyApproved: 0,
            qtyReceived: 0,
            qtyAllocated: 0,
            targetQty: 0,
            lane: resolveLane({
              requestStatus,
              targetQty: 0,
              qtyReceived: 0,
              qtyAllocated: 0,
            }),
          });
          continue;
        }

        for (const item of requestItems) {
          const itemStatus = clean(item.status).toLowerCase();
          if (CANCELLED_ITEM_STATUSES.has(itemStatus)) continue;

          const qtyRequested = Math.max(
            0,
            numberValue(item.qty_requested ?? item.qty),
          );
          const qtyApproved = Math.max(0, numberValue(item.qty_approved));
          const qtyReceived = Math.max(0, numberValue(item.qty_received));
          const qtyAllocated = Math.max(0, numberValue(item.qty_consumed));
          const targetQty = Math.max(qtyApproved, qtyRequested);

          nextEntries.push({
            key: item.id,
            requestId: request.id,
            workOrderId: request.work_order_id,
            workOrderLineId: item.work_order_line_id ?? request.job_id,
            workOrderLabel,
            itemId: item.id,
            partId: item.part_id,
            description: clean(item.description) || "Requested part",
            itemStatus: itemStatus || requestStatus,
            qtyRequested,
            qtyApproved,
            qtyReceived,
            qtyAllocated,
            targetQty,
            lane: resolveLane({
              requestStatus,
              targetQty,
              qtyReceived,
              qtyAllocated,
            }),
          });
        }
      }

      setEntries(nextEntries);
      setLocations((locationResult.data ?? []) as LocationLite[]);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load the parts workflow.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("parts:received", refresh);
    return () => window.removeEventListener("parts:received", refresh);
  }, [load]);

  const counts = useMemo(
    () => ({
      requests: entries.filter((entry) => entry.lane === "requests").length,
      approval: entries.filter((entry) => entry.lane === "approval").length,
      ordered: entries.filter((entry) => entry.lane === "ordered").length,
      ready: entries.filter((entry) => entry.lane === "ready").length,
    }),
    [entries],
  );
  const visibleEntries = useMemo(
    () => entries.filter((entry) => entry.lane === lane),
    [entries, lane],
  );
  const locationOptions = useMemo(
    () =>
      locations.map((location) => ({
        value: location.id,
        label: [location.code, location.name].filter(Boolean).join(" — "),
      })),
    [locations],
  );
  const defaultLocationId = useMemo(() => {
    const main = locations.find(
      (location) => clean(location.code).toUpperCase() === "MAIN",
    );
    return main?.id ?? locations[0]?.id ?? "";
  }, [locations]);

  const openAllocation = (entry: WorkflowEntry) => {
    if (!entry.itemId || !defaultLocationId) {
      toast.error("Select an actionable item and stock location first.");
      return;
    }
    const available = Math.max(
      0,
      Math.min(entry.qtyReceived, entry.targetQty) - entry.qtyAllocated,
    );
    setAllocation({
      entry,
      locationId: defaultLocationId,
      qty: available || 1,
    });
  };

  const submitAllocation = async () => {
    if (!allocation?.entry.itemId) return;
    const remaining = Math.max(
      0,
      allocation.entry.targetQty - allocation.entry.qtyAllocated,
    );
    if (!allocation.locationId) {
      toast.error("Select a stock location.");
      return;
    }
    if (!Number.isFinite(allocation.qty) || allocation.qty <= 0) {
      toast.error("Allocation quantity must be greater than zero.");
      return;
    }
    if (remaining > 0 && allocation.qty > remaining) {
      toast.error(`Allocation exceeds remaining quantity (${formatQty(remaining)}).`);
      return;
    }

    setAllocating(true);
    try {
      const key = operationKey("allocate", allocation.entry.itemId);
      const response = await fetch(
        `/api/parts/requests/items/${encodeURIComponent(
          allocation.entry.itemId,
        )}/allocate`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify({
            location_id: allocation.locationId,
            qty: allocation.qty,
            idempotencyKey: key,
          }),
        },
      );
      const json = (await response.json().catch(() => null)) as ApiResult | null;
      if (!response.ok || json?.ok === false || json?.error) {
        throw new Error(json?.error || "Unable to allocate the part.");
      }

      toast.success("Part allocated to the job.");
      setAllocation(null);
      await load();
    } catch (allocationError) {
      toast.error(
        allocationError instanceof Error
          ? allocationError.message
          : "Unable to allocate the part.",
      );
    } finally {
      setAllocating(false);
    }
  };

  const selectedReceiveItem: ReceiveDrawerItem | null = receiveEntry?.itemId
    ? {
        id: receiveEntry.itemId,
        request_id: receiveEntry.requestId,
        part_id: receiveEntry.partId,
        description: receiveEntry.description,
        status: receiveEntry.itemStatus,
        qty_approved: receiveEntry.targetQty,
        qty_received: receiveEntry.qtyReceived,
        qty_remaining: Math.max(
          0,
          receiveEntry.targetQty - receiveEntry.qtyReceived,
        ),
      }
    : null;

  const lanes: Lane[] = ["requests", "approval", "ordered", "ready"];

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-2">
        {lanes.map((laneKey) => (
          <button
            key={laneKey}
            type="button"
            onClick={() => setLane(laneKey)}
            className={[
              "min-h-20 rounded-2xl border p-3 text-left transition",
              lane === laneKey
                ? "border-[color:var(--accent-copper)] bg-[color:var(--theme-surface-panel)]"
                : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]",
            ].join(" ")}
          >
            <span className="block text-xs text-[color:var(--theme-text-secondary)]">
              {laneLabel(laneKey)}
            </span>
            <span className="mt-1 block text-2xl font-semibold text-[color:var(--theme-text-primary)]">
              {loading ? "…" : counts[laneKey]}
            </span>
          </button>
        ))}
      </section>

      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-copper)]">
              {laneLabel(lane)}
            </div>
            <h2 className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
              {counts[lane]} active {counts[lane] === 1 ? "item" : "items"}
            </h2>
          </div>
          <button
            type="button"
            className={actionClass}
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/35 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {!loading && !error && visibleEntries.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-5 text-sm text-[color:var(--theme-text-secondary)]">
            No parts are currently in this lane.
          </div>
        ) : null}

        <div className="mt-4 grid gap-3">
          {visibleEntries.map((entry) => {
            const remainingReceive = Math.max(
              0,
              entry.targetQty - entry.qtyReceived,
            );
            const remainingAllocate = Math.max(
              0,
              entry.targetQty - entry.qtyAllocated,
            );
            const workbenchHref = entry.workOrderId
              ? `/parts/requests/${entry.workOrderId}`
              : "/parts/requests";

            return (
              <article
                key={entry.key}
                className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                      {entry.workOrderLabel}
                    </div>
                    <h3 className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)]">
                      {entry.description}
                    </h3>
                  </div>
                  <span className="shrink-0 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                    {entry.itemStatus.replaceAll("_", " ")}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[10px] text-[color:var(--theme-text-secondary)]">
                  {[
                    ["Requested", entry.qtyRequested],
                    ["Approved", entry.qtyApproved],
                    ["Received", entry.qtyReceived],
                    ["Allocated", entry.qtyAllocated],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-2"
                    >
                      <span className="block">{label}</span>
                      <strong className="mt-0.5 block text-sm text-[color:var(--theme-text-primary)]">
                        {formatQty(Number(value))}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {lane === "ordered" && entry.itemId ? (
                    <button
                      type="button"
                      className={primaryActionClass}
                      onClick={() => setReceiveEntry(entry)}
                      disabled={remainingReceive <= 0 || locations.length === 0}
                    >
                      Receive {remainingReceive > 0 ? formatQty(remainingReceive) : ""}
                    </button>
                  ) : null}

                  {lane === "ready" && entry.itemId ? (
                    <button
                      type="button"
                      className={primaryActionClass}
                      onClick={() => openAllocation(entry)}
                      disabled={remainingAllocate <= 0 || locations.length === 0}
                    >
                      Allocate {remainingAllocate > 0 ? formatQty(remainingAllocate) : ""}
                    </button>
                  ) : null}

                  <Link className={actionClass} href={workbenchHref}>
                    Open parts workbench
                  </Link>

                  {entry.workOrderLineId ? (
                    <Link
                      className={actionClass}
                      href={`/mobile/jobs/${entry.workOrderLineId}`}
                    >
                      Open job
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <ReceiveDrawer
        open={Boolean(receiveEntry)}
        onClose={() => setReceiveEntry(null)}
        item={selectedReceiveItem}
        locations={locationOptions}
        defaultLocationId={defaultLocationId}
      />

      {allocation ? (
        <div
          className="fixed inset-0 z-[700] flex items-end justify-center bg-[color:var(--theme-surface-overlay)] p-3 backdrop-blur-sm sm:items-center"
          onClick={() => {
            if (!allocating) setAllocation(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Allocate part to job"
            className="w-full max-w-lg rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-5 shadow-[var(--theme-shadow-medium)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-copper)]">
              Ready for technician
            </div>
            <h3 className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
              Allocate {allocation.entry.description}
            </h3>

            <label className="mt-4 block text-sm text-[color:var(--theme-text-secondary)]">
              Stock location
              <select
                value={allocation.locationId}
                onChange={(event) =>
                  setAllocation((current) =>
                    current
                      ? { ...current, locationId: event.target.value }
                      : current,
                  )
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-[color:var(--theme-text-primary)]"
              >
                <option value="">Select a location</option>
                {locationOptions.map((location) => (
                  <option key={location.value} value={location.value}>
                    {location.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-sm text-[color:var(--theme-text-secondary)]">
              Quantity
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={allocation.qty}
                onChange={(event) =>
                  setAllocation((current) =>
                    current
                      ? { ...current, qty: numberValue(event.target.value) }
                      : current,
                  )
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-[color:var(--theme-text-primary)]"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={actionClass}
                disabled={allocating}
                onClick={() => setAllocation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={primaryActionClass}
                disabled={allocating}
                onClick={() => void submitAllocation()}
              >
                {allocating ? "Allocating…" : "Allocate to job"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
