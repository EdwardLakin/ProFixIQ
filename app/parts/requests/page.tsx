"use client";

import Link from "next/link";
import {
  Check,
  ClipboardList,
  History,
  ListChecks,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  earliestPartsRequestStage,
  isPartsRequestItemHandedOff,
  isPartsRequestItemPriced,
  isPartsRequestItemStaged,
  partsRequestStageLabel,
  toPartsRequestStage,
  type PartsRequestStage,
  type PartsRequestStageItem,
} from "@/features/parts/lib/status-display";

type DB = Database;
type PartRequest = DB["public"]["Tables"]["part_requests"]["Row"];
type PartRequestItem = DB["public"]["Tables"]["part_request_items"]["Row"];

type QueueItem = Pick<
  PartRequestItem,
  | "id"
  | "request_id"
  | "description"
  | "part_id"
  | "quoted_price"
  | "unit_price"
  | "qty"
  | "qty_requested"
  | "qty_approved"
  | "qty_ordered"
  | "qty_received"
  | "qty_reserved"
  | "qty_consumed"
  | "qty_returned"
  | "status"
  | "updated_at"
>;

type RequestModel = {
  request: PartRequest;
  items: QueueItem[];
  stage: PartsRequestStage;
};

type WorkOrderListRow = {
  id: string;
  custom_id: string | null;
  customers:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
  vehicles:
    | {
        year: string | number | null;
        make: string | null;
        model: string | null;
      }
    | {
        year: string | number | null;
        make: string | null;
        model: string | null;
      }[]
    | null;
};

type WoBucket = {
  workOrderId: string;
  customId: string | null;
  customerName: string | null;
  vehicleLabel: string | null;
  models: RequestModel[];
  items: QueueItem[];
  stage: PartsRequestStage;
  latestAt: string | null;
  searchBlob: string;
};

type QueueTab = "active" | "completed";
type StageFilter = "all" | Exclude<PartsRequestStage, "completed">;

const ACTIVE_STAGES: Exclude<PartsRequestStage, "completed">[] = [
  "needs_quote",
  "awaiting_approval",
  "order_receive",
  "ready_for_tech",
];

const REQUEST_STATUSES: PartRequest["status"][] = [
  "requested",
  "quoted",
  "approved",
  "partially_ordered",
  "partially_consumed",
  "partially_returned",
  "returned",
  "fulfilled",
  "rejected",
  "deferred",
  "cancelled",
];

const STAGE_META = {
  needs_quote: {
    icon: ClipboardList,
    accent: "border-t-rose-500",
    iconClass: "border-rose-300/40 bg-rose-500/10 text-rose-400",
    pill: "border-rose-300/35 bg-rose-500/10 text-rose-300",
    button:
      "border-rose-400/45 bg-rose-500/12 text-rose-200 hover:bg-rose-500/20",
    next: "Add pricing for every item and finish the parts quote.",
    action: "Finish quote",
  },
  awaiting_approval: {
    icon: ListChecks,
    accent: "border-t-amber-500",
    iconClass: "border-amber-300/40 bg-amber-500/10 text-amber-400",
    pill: "border-amber-300/35 bg-amber-500/10 text-amber-300",
    button:
      "border-amber-400/45 bg-amber-500/12 text-amber-200 hover:bg-amber-500/20",
    next: "Customer decision pending. Approval automatically releases Parts action.",
    action: "View request",
  },
  order_receive: {
    icon: ShoppingCart,
    accent: "border-t-sky-500",
    iconClass: "border-sky-300/40 bg-sky-500/10 text-sky-400",
    pill: "border-sky-300/35 bg-sky-500/10 text-sky-300",
    button: "border-sky-400/45 bg-sky-500/12 text-sky-200 hover:bg-sky-500/20",
    next: "Pick and allocate available stock, or order and receive the shortage.",
    action: "Order & receive",
  },
  ready_for_tech: {
    icon: PackageCheck,
    accent: "border-t-emerald-500",
    iconClass: "border-emerald-300/40 bg-emerald-500/10 text-emerald-400",
    pill: "border-emerald-300/35 bg-emerald-500/10 text-emerald-300",
    button:
      "border-emerald-400/45 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/20",
    next: "All approved parts are staged. Hand them to the technician.",
    action: "Complete handoff",
  },
} as const;

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stageItem(item: QueueItem): PartsRequestStageItem {
  return {
    description: item.description,
    partId: item.part_id,
    quotedPrice: item.quoted_price,
    unitPrice: item.unit_price,
    qty: item.qty,
    qtyRequested: item.qty_requested,
    qtyApproved: item.qty_approved,
    qtyOrdered: item.qty_ordered,
    qtyReceived: item.qty_received,
    qtyReserved: item.qty_reserved,
    qtyConsumed: item.qty_consumed,
    qtyReturned: item.qty_returned,
    rawStatus: item.status,
  };
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function customerName(row: WorkOrderListRow | undefined): string | null {
  const customer = firstJoin(row?.customers);
  const label = [customer?.first_name, customer?.last_name]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return label || null;
}

function vehicleLabel(row: WorkOrderListRow | undefined): string | null {
  const vehicle = firstJoin(row?.vehicles);
  const label = [vehicle?.year, vehicle?.make, vehicle?.model]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return label || null;
}

function buildBuckets(
  models: RequestModel[],
  workOrders: Record<string, WorkOrderListRow>,
): WoBucket[] {
  const grouped = new Map<string, RequestModel[]>();
  for (const model of models) {
    const workOrderId = model.request.work_order_id;
    if (!workOrderId) continue;
    grouped.set(workOrderId, [...(grouped.get(workOrderId) ?? []), model]);
  }

  return [...grouped.entries()]
    .map(([workOrderId, requestModels]) => {
      const workOrder = workOrders[workOrderId];
      const items = requestModels.flatMap((model) => model.items);
      const latestAt =
        [...requestModels]
          .flatMap((model) => [
            model.request.created_at,
            ...model.items.map((item) => item.updated_at),
          ])
          .filter((value): value is string => typeof value === "string")
          .sort()
          .at(-1) ?? null;
      const stage = earliestPartsRequestStage(
        requestModels.map((model) => model.stage),
      );
      const customer = customerName(workOrder);
      const vehicle = vehicleLabel(workOrder);
      const searchBlob = [
        workOrderId,
        workOrder?.custom_id,
        customer,
        vehicle,
        ...requestModels.map((model) => model.request.id),
        ...items.map((item) => item.description),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return {
        workOrderId,
        customId: workOrder?.custom_id ?? null,
        customerName: customer,
        vehicleLabel: vehicle,
        models: requestModels,
        items,
        stage,
        latestAt,
        searchBlob,
      };
    })
    .sort((a, b) =>
      String(b.latestAt ?? "").localeCompare(String(a.latestAt ?? "")),
    );
}

function workOrderLabel(bucket: WoBucket): string {
  return bucket.customId || `#${bucket.workOrderId.slice(0, 8)}`;
}

function requestHref(bucket: WoBucket): string {
  return `/parts/requests/${encodeURIComponent(
    bucket.customId || bucket.workOrderId,
  )}`;
}

function completedSteps(bucket: WoBucket): number {
  if (bucket.stage === "needs_quote") return 0;
  if (bucket.stage === "awaiting_approval") return 1;
  if (bucket.stage === "ready_for_tech") return 4;
  if (bucket.stage === "completed") return 5;
  if (bucket.items.some((item) => num(item.qty_received) > 0)) return 3;
  return bucket.items.some((item) => num(item.qty_ordered) > 0) ? 3 : 2;
}

function itemStateSummary(bucket: WoBucket): string {
  const items = bucket.items.map(stageItem);
  if (bucket.stage === "needs_quote") {
    const missing = items.filter(
      (item) => !isPartsRequestItemPriced(item),
    ).length;
    return `${missing} need pricing`;
  }
  if (bucket.stage === "awaiting_approval") return "Customer pending";
  if (bucket.stage === "ready_for_tech") {
    return `${items.filter(isPartsRequestItemStaged).length} staged`;
  }
  if (bucket.stage === "completed") {
    const terminal = new Set(
      bucket.models.map((model) => String(model.request.status)),
    );
    if (terminal.has("rejected")) return "Declined";
    if (terminal.has("deferred")) return "Deferred";
    if (terminal.has("cancelled")) return "Cancelled";
    return `${items.filter(isPartsRequestItemHandedOff).length} handed off`;
  }

  const ordered = bucket.items.filter(
    (item) => num(item.qty_ordered) > 0,
  ).length;
  const partial = bucket.items.filter(
    (item) =>
      num(item.qty_received) > 0 &&
      num(item.qty_received) < num(item.qty_requested),
  ).length;
  if (ordered || partial) {
    return `${ordered} ordered${partial ? ` · ${partial} partial` : ""}`;
  }
  return `${bucket.items.length} need pick/order`;
}

function ProgressRail({ bucket }: { bucket: WoBucket }) {
  const labels = ["Quote", "Approval", "Order", "Receive", "Handoff"];
  const complete = completedSteps(bucket);
  return (
    <div className="mt-3">
      <div className="mb-2 text-[11px] font-medium text-[color:var(--theme-text-secondary)]">
        Progress
      </div>
      <div className="grid grid-cols-5">
        {labels.map((label, index) => {
          const done = index < complete;
          const current = index === complete && complete < labels.length;
          return (
            <div
              key={label}
              className="relative flex min-w-0 flex-col items-center"
            >
              {index > 0 ? (
                <span
                  className={`absolute right-1/2 top-[7px] h-px w-full ${
                    index <= complete
                      ? "bg-[color:var(--brand-accent,#c9733d)]"
                      : "bg-[color:var(--theme-border-soft)]"
                  }`}
                />
              ) : null}
              <span
                className={`relative z-10 flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${
                  done
                    ? "border-[color:var(--brand-accent,#c9733d)] bg-[color:var(--brand-accent,#c9733d)] text-white"
                    : current
                      ? "border-[color:var(--brand-accent,#c9733d)] bg-[color:var(--theme-surface-page)]"
                      : "border-[color:var(--theme-border-strong)] bg-[color:var(--theme-surface-page)]"
                }`}
              >
                {done ? <Check className="h-2.5 w-2.5" /> : null}
              </span>
              <span className="mt-1 truncate text-[9px] text-[color:var(--theme-text-muted)]">
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QueueCard({
  bucket,
  handingOff,
  onHandoff,
}: {
  bucket: WoBucket;
  handingOff: boolean;
  onHandoff: (bucket: WoBucket) => Promise<void>;
}) {
  const meta = bucket.stage === "completed" ? null : STAGE_META[bucket.stage];
  const href = requestHref(bucket);
  const nextAction = meta?.next ?? "Review the completed request history.";

  return (
    <article className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-4 shadow-[var(--theme-shadow-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-xl font-semibold tracking-tight text-[color:var(--theme-text-primary)]">
            {workOrderLabel(bucket)}
          </h3>
          {bucket.customerName ? (
            <p className="mt-1 truncate text-sm font-medium text-[color:var(--theme-text-primary)]">
              {bucket.customerName}
            </p>
          ) : null}
          {bucket.vehicleLabel ? (
            <p className="mt-0.5 truncate text-xs text-[color:var(--theme-text-secondary)]">
              {bucket.vehicleLabel}
            </p>
          ) : null}
        </div>
        {meta ? (
          <span
            className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${meta.pill}`}
          >
            Next: {meta.action}
          </span>
        ) : (
          <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--theme-text-secondary)]">
            Closed
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 divide-x divide-[color:var(--theme-border-soft)] border-y border-[color:var(--theme-border-soft)] py-3 text-center">
        <div>
          <div className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
            {bucket.models.length}
          </div>
          <div className="text-[11px] text-[color:var(--theme-text-secondary)]">
            Request{bucket.models.length === 1 ? "" : "s"}
          </div>
        </div>
        <div>
          <div className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
            {bucket.items.length}
          </div>
          <div className="text-[11px] text-[color:var(--theme-text-secondary)]">
            Item{bucket.items.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="mt-3 min-h-[70px]">
        <div className="text-[11px] font-medium text-[color:var(--theme-text-secondary)]">
          Next action
        </div>
        <p className="mt-1 text-sm leading-5 text-[color:var(--theme-text-primary)]">
          {nextAction}
        </p>
      </div>

      <div className="mt-3 border-t border-dashed border-[color:var(--theme-border-soft)] pt-3">
        <div className="text-[11px] font-medium text-[color:var(--theme-text-secondary)]">
          Item status
        </div>
        <span
          className={`mt-1.5 inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${
            meta?.pill ??
            "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)]"
          }`}
        >
          {itemStateSummary(bucket)}
        </span>
      </div>

      <ProgressRail bucket={bucket} />

      {bucket.stage === "ready_for_tech" ? (
        <button
          type="button"
          onClick={() => void onHandoff(bucket)}
          disabled={handingOff}
          className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${meta?.button}`}
        >
          <Wrench className="h-4 w-4" />
          {handingOff ? "Completing handoff…" : "Complete handoff"}
        </button>
      ) : (
        <Link
          href={href}
          className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
            meta?.button ??
            "border-[color:var(--theme-border-strong)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-overlay)]"
          }`}
        >
          {meta?.action ?? "Open history"} <span aria-hidden>→</span>
        </Link>
      )}
    </article>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof ClipboardList;
  value: number;
  label: string;
  tone: "copper" | "amber" | "green";
}) {
  const colors =
    tone === "copper"
      ? "border-orange-300/30 bg-orange-500/10 text-orange-400"
      : tone === "amber"
        ? "border-amber-300/30 bg-amber-500/10 text-amber-400"
        : "border-emerald-300/30 bg-emerald-500/10 text-emerald-400";
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3 sm:px-6">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${colors}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-2xl font-semibold leading-none text-[color:var(--theme-text-primary)]">
          {value}
        </div>
        <div className="mt-1 truncate text-sm text-[color:var(--theme-text-secondary)]">
          {label}
        </div>
      </div>
    </div>
  );
}

export default function PartsRequestsPage(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const initialLoad = useRef(true);
  const reloadSequence = useRef(0);
  const [models, setModels] = useState<RequestModel[]>([]);
  const [workOrders, setWorkOrders] = useState<
    Record<string, WorkOrderListRow>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<QueueTab>("active");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [handingOffWorkOrder, setHandingOffWorkOrder] = useState<string | null>(
    null,
  );

  const reload = useCallback(async () => {
    const sequence = ++reloadSequence.current;
    if (initialLoad.current) setLoading(true);
    else setRefreshing(true);

    try {
      const requestRows: PartRequest[] = [];
      const requestPageSize = 500;
      for (let offset = 0; ; offset += requestPageSize) {
        const { data: requests, error: requestError } = await supabase
          .from("part_requests")
          .select("*")
          .in("status", REQUEST_STATUSES)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(offset, offset + requestPageSize - 1);
        if (requestError) throw requestError;
        const requestPage = (requests ?? []) as PartRequest[];
        requestRows.push(...requestPage);
        if (requestPage.length < requestPageSize) break;
      }

      const requestIds = requestRows.map((request) => request.id);
      const itemRows: QueueItem[] = [];

      if (requestIds.length > 0) {
        const pageSize = 1000;
        for (
          let chunkStart = 0;
          chunkStart < requestIds.length;
          chunkStart += 200
        ) {
          const requestChunk = requestIds.slice(chunkStart, chunkStart + 200);
          for (let offset = 0; ; offset += pageSize) {
            const { data: items, error: itemError } = await supabase
              .from("part_request_items")
              .select(
                "id,request_id,description,part_id,quoted_price,unit_price,qty,qty_requested,qty_approved,qty_ordered,qty_received,qty_reserved,qty_consumed,qty_returned,status,updated_at",
              )
              .in("request_id", requestChunk)
              .order("id", { ascending: true })
              .range(offset, offset + pageSize - 1);
            if (itemError) throw itemError;
            const itemPage = (items ?? []) as QueueItem[];
            itemRows.push(...itemPage);
            if (itemPage.length < pageSize) break;
          }
        }
      }

      const itemsByRequest = new Map<string, QueueItem[]>();
      for (const item of itemRows) {
        itemsByRequest.set(item.request_id, [
          ...(itemsByRequest.get(item.request_id) ?? []),
          item,
        ]);
      }

      const nextModels = requestRows.map((request) => {
        const items = itemsByRequest.get(request.id) ?? [];
        return {
          request,
          items,
          stage: toPartsRequestStage({
            rawStatus: request.status,
            items: items.map(stageItem),
          }),
        } satisfies RequestModel;
      });

      const workOrderIds = [
        ...new Set(
          requestRows
            .map((request) => request.work_order_id)
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      const nextWorkOrders: Record<string, WorkOrderListRow> = {};
      if (workOrderIds.length > 0) {
        for (
          let chunkStart = 0;
          chunkStart < workOrderIds.length;
          chunkStart += 200
        ) {
          const { data: rows, error: workOrderError } = await supabase
            .from("work_orders")
            .select(
              "id,custom_id,customers(first_name,last_name),vehicles(year,make,model)",
            )
            .in("id", workOrderIds.slice(chunkStart, chunkStart + 200));
          if (workOrderError) throw workOrderError;
          for (const row of rows ?? []) {
            const workOrder = row as WorkOrderListRow;
            nextWorkOrders[workOrder.id] = workOrder;
          }
        }
      }

      if (sequence === reloadSequence.current) {
        setModels(nextModels);
        setWorkOrders(nextWorkOrders);
      }
    } catch (error) {
      if (sequence === reloadSequence.current) {
        console.error("[parts/requests] queue load failed", error);
        toast.error("Unable to load the Parts request queue.");
      }
    } finally {
      if (sequence === reloadSequence.current) {
        initialLoad.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [supabase]);

  useEffect(() => {
    void reload();

    const channel = supabase
      .channel("parts-request-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "part_requests" },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "part_request_items" },
        () => void reload(),
      )
      .subscribe();
    const fallback = window.setInterval(() => void reload(), 45_000);

    const onLocalChange = () => void reload();
    window.addEventListener("parts-request:submitted", onLocalChange);
    window.addEventListener("parts:received", onLocalChange);

    return () => {
      window.clearInterval(fallback);
      window.removeEventListener("parts-request:submitted", onLocalChange);
      window.removeEventListener("parts:received", onLocalChange);
      void supabase.removeChannel(channel);
    };
  }, [reload, supabase]);

  const activeModels = useMemo(
    () => models.filter((model) => model.stage !== "completed"),
    [models],
  );
  const completedModels = useMemo(
    () => models.filter((model) => model.stage === "completed"),
    [models],
  );
  const activeBuckets = useMemo(
    () => buildBuckets(activeModels, workOrders),
    [activeModels, workOrders],
  );
  const completedBuckets = useMemo(
    () => buildBuckets(completedModels, workOrders),
    [completedModels, workOrders],
  );

  const visibleBuckets = useMemo(() => {
    const query = search.trim().toLowerCase();
    let buckets = tab === "active" ? activeBuckets : completedBuckets;
    if (tab === "active" && stageFilter !== "all") {
      buckets = buckets.filter((bucket) => bucket.stage === stageFilter);
    }
    return query
      ? buckets.filter((bucket) => bucket.searchBlob.includes(query))
      : buckets;
  }, [activeBuckets, completedBuckets, search, stageFilter, tab]);

  const activeItemCount = activeModels.reduce(
    (total, model) =>
      total +
      model.items.filter((item) => String(item.status) !== "cancelled").length,
    0,
  );

  const completeHandoff = useCallback(
    async (bucket: WoBucket) => {
      if (handingOffWorkOrder) return;
      const readyRequests = bucket.models.filter(
        (model) => model.stage === "ready_for_tech",
      );
      if (readyRequests.length !== bucket.models.length) {
        toast.error(
          "Every active request on this work order must be staged first.",
        );
        return;
      }

      setHandingOffWorkOrder(bucket.workOrderId);
      const toastId = toast.loading("Completing technician handoff…");
      try {
        for (const model of readyRequests) {
          const operationKey = `${model.request.id}:${crypto.randomUUID()}`;
          const response = await fetch(
            `/api/parts/requests/${model.request.id}/handoff`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": operationKey,
              },
              body: JSON.stringify({ idempotencyKey: operationKey }),
            },
          );
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (!response.ok) {
            throw new Error(payload?.error || "Parts handoff failed.");
          }
        }
        toast.success("Parts handed off and moved to Completed.", {
          id: toastId,
        });
        await reload();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Parts handoff failed.",
          { id: toastId },
        );
      } finally {
        setHandingOffWorkOrder(null);
      }
    },
    [handingOffWorkOrder, reload],
  );

  const metricModels = tab === "active" ? activeModels : completedModels;
  const metricBuckets = tab === "active" ? activeBuckets : completedBuckets;
  const metricItems = metricModels.reduce(
    (total, model) => total + model.items.length,
    0,
  );

  return (
    <main className="w-full space-y-5 px-3 py-4 text-[color:var(--theme-text-primary)] sm:px-5 lg:px-8 xl:px-10">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Parts Requests
            </h1>
            <div className="mt-4 flex items-center gap-6 border-b border-[color:var(--theme-border-soft)]">
              <button
                type="button"
                onClick={() => setTab("active")}
                className={`border-b-2 px-3 pb-3 text-sm font-semibold transition ${
                  tab === "active"
                    ? "border-[color:var(--brand-accent,#c9733d)] text-[color:var(--brand-accent,#c9733d)]"
                    : "border-transparent text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setTab("completed")}
                className={`flex items-center gap-2 border-b-2 px-3 pb-3 text-sm font-semibold transition ${
                  tab === "completed"
                    ? "border-[color:var(--brand-accent,#c9733d)] text-[color:var(--brand-accent,#c9733d)]"
                    : "border-transparent text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
                }`}
              >
                Completed <History className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <label className="relative min-w-0 flex-1 lg:w-[360px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]" />
              <span className="sr-only">Search requests</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search work orders, customers, parts…"
                className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[color:var(--brand-accent,#c9733d)]"
              />
            </label>
            {tab === "active" ? (
              <label className="relative">
                <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-secondary)]" />
                <span className="sr-only">Filter workflow stage</span>
                <select
                  value={stageFilter}
                  onChange={(event) =>
                    setStageFilter(event.target.value as StageFilter)
                  }
                  className="h-full min-h-10 appearance-none rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] py-2 pl-10 pr-8 text-sm outline-none focus:border-[color:var(--brand-accent,#c9733d)]"
                >
                  <option value="all">All stages</option>
                  {ACTIVE_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {partsRequestStageLabel(stage)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              onClick={() => void reload()}
              disabled={refreshing}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-sm font-medium transition hover:bg-[color:var(--theme-surface-overlay)] disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              <span className="sm:hidden">Refresh</span>
            </button>
          </div>
        </div>

        <div className="grid overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] sm:grid-cols-3 sm:divide-x sm:divide-[color:var(--theme-border-soft)]">
          <Metric
            icon={ClipboardList}
            value={metricBuckets.length}
            label={
              tab === "active" ? "Active work orders" : "Completed work orders"
            }
            tone="copper"
          />
          <Metric
            icon={ListChecks}
            value={metricModels.length}
            label={tab === "active" ? "Open requests" : "Closed requests"}
            tone="amber"
          />
          <Metric
            icon={PackageCheck}
            value={tab === "active" ? activeItemCount : metricItems}
            label="Items"
            tone="green"
          />
        </div>
      </section>

      {loading ? (
        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-8 text-center text-sm text-[color:var(--theme-text-secondary)]">
          Loading the live Parts workflow…
        </div>
      ) : tab === "active" ? (
        <div
          className={`grid gap-3 ${stageFilter === "all" ? "lg:grid-cols-2 2xl:grid-cols-4" : "max-w-xl"}`}
        >
          {ACTIVE_STAGES.filter(
            (stage) => stageFilter === "all" || stageFilter === stage,
          ).map((stage) => {
            const meta = STAGE_META[stage];
            const Icon = meta.icon;
            const stageBuckets = visibleBuckets.filter(
              (bucket) => bucket.stage === stage,
            );
            return (
              <section
                key={stage}
                className={`min-w-0 rounded-2xl border border-t-4 border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2.5 ${meta.accent}`}
              >
                <header className="flex items-center justify-between gap-3 px-1 py-1.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${meta.iconClass}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <h2 className="truncate text-sm font-semibold">
                      {partsRequestStageLabel(stage)}
                    </h2>
                  </div>
                  <span className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2 py-0.5 text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                    {stageBuckets.length}
                  </span>
                </header>

                <div className="mt-2 space-y-2.5">
                  {stageBuckets.length ? (
                    stageBuckets.map((bucket) => (
                      <QueueCard
                        key={bucket.workOrderId}
                        bucket={bucket}
                        handingOff={handingOffWorkOrder === bucket.workOrderId}
                        onHandoff={completeHandoff}
                      />
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-8 text-center text-xs text-[color:var(--theme-text-muted)]">
                      No matching work orders
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : visibleBuckets.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleBuckets.map((bucket) => (
            <QueueCard
              key={bucket.workOrderId}
              bucket={bucket}
              handingOff={false}
              onHandoff={completeHandoff}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-10 text-center">
          <History className="mx-auto h-7 w-7 text-[color:var(--theme-text-muted)]" />
          <p className="mt-3 text-sm text-[color:var(--theme-text-secondary)]">
            No completed requests match this search.
          </p>
        </div>
      )}
    </main>
  );
}
