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
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import RouteLoadPanel from "@/features/shared/components/ui/RouteLoadPanel";
import {
  asRouteLoadFailure,
  routeLoadFailureFromStatus,
  runBoundedRouteLoad,
  type RouteLoadFailure,
} from "@/features/shared/lib/route-load";
import PickOrderTaskModal from "@/features/parts/components/PickOrderTaskModal";
import MenuItemPartsIntakeModal, {
  type MenuIntakeQueueItem,
} from "@/features/parts/components/MenuItemPartsIntakeModal";
import { isDismissibleEmptyPartRequestBucket } from "@/features/parts/lib/requests/empty-request";
import {
  buildPartsRequestQueueModels,
  isPartsRequestQueueSnapshot,
  readPartsRequestIdFromRealtimePayload,
  reconcilePartsRequestQueueSnapshot,
  type PartsRequestQueueItem,
  type PartsRequestQueueMenuItem,
  type PartsRequestQueueModel,
  type PartsRequestQueueSnapshot,
  type PartsRequestQueueWorkOrder,
} from "@/features/parts/lib/requests/parts-request-queue";
import {
  earliestPartsRequestStage,
  isPartsRequestItemHandedOff,
  isMenuIntakeItemReviewed,
  isPartsRequestItemPriced,
  isPartsRequestItemStaged,
  partsRequestStageLabel,
  type PartsRequestStage,
  type PartsRequestStageItem,
} from "@/features/parts/lib/status-display";

type QueueItem = PartsRequestQueueItem;
type RequestModel = PartsRequestQueueModel;
type WorkOrderListRow = PartsRequestQueueWorkOrder;
type MenuItemLite = PartsRequestQueueMenuItem;

type WoBucket = {
  bucketId: string;
  workOrderId: string | null;
  menuItemId: string | null;
  menuItemName: string | null;
  customId: string | null;
  estimateNumber: string | null;
  estimateRevision: number | null;
  isEstimate: boolean;
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

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function customerName(row: WorkOrderListRow | undefined): string | null {
  const customer = firstJoin(row?.customers);
  if (customer?.business_name?.trim()) return customer.business_name.trim();
  const label = [customer?.first_name, customer?.last_name]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return label || null;
}

function vehicleLabel(row: WorkOrderListRow | undefined): string | null {
  const vehicle = firstJoin(row?.vehicles);
  const vehicleName = [vehicle?.year, vehicle?.make, vehicle?.model]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const unitNumber = String(vehicle?.unit_number ?? "").trim();
  const vin = String(vehicle?.vin ?? "").trim();
  const label = [
    vehicleName,
    unitNumber ? `Unit ${unitNumber}` : "",
    vin ? `VIN ${vin}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return label || null;
}

function buildBuckets(
  models: RequestModel[],
  workOrders: Record<string, WorkOrderListRow>,
  menuItems: Record<string, MenuItemLite>,
): WoBucket[] {
  const grouped = new Map<string, RequestModel[]>();
  for (const model of models) {
    const workOrderId = model.request.work_order_id;
    const menuItemId = model.request.source_menu_item_id ?? null;
    const bucketId = workOrderId
      ? `work-order:${workOrderId}`
      : menuItemId
        ? `menu-item:${menuItemId}`
        : `request:${model.request.id}`;
    grouped.set(bucketId, [...(grouped.get(bucketId) ?? []), model]);
  }

  return [...grouped.entries()]
    .map(([bucketId, requestModels]) => {
      const workOrderId = requestModels[0]?.request.work_order_id ?? null;
      const menuItemId = requestModels[0]?.request.source_menu_item_id ?? null;
      const workOrder = workOrderId ? workOrders[workOrderId] : undefined;
      const menuItem = menuItemId ? menuItems[menuItemId] : undefined;
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
      const isEstimate =
        requestModels.some(
          (model) => model.request.source_context === "estimate",
        ) || Boolean(workOrder?.estimate_number);
      const estimateRevision = requestModels.reduce<number | null>(
        (latest, model) => {
          const revision = model.request.source_revision;
          if (revision == null) return latest;
          return latest == null ? revision : Math.max(latest, revision);
        },
        null,
      );
      const searchBlob = [
        workOrderId,
        workOrder?.custom_id,
        workOrder?.estimate_number,
        menuItem?.name,
        "menu intake",
        ...requestModels.map((model) => model.request.notes),
        customer,
        vehicle,
        ...requestModels.map((model) => model.request.id),
        ...items.map((item) => item.description),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return {
        bucketId,
        workOrderId,
        menuItemId,
        menuItemName: menuItem?.name?.trim() || null,
        customId: workOrder?.custom_id ?? null,
        estimateNumber: workOrder?.estimate_number ?? null,
        estimateRevision,
        isEstimate,
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
  if (bucket.workOrderId) {
    return (
      bucket.estimateNumber ||
      bucket.customId ||
      `#${bucket.workOrderId.slice(0, 8)}`
    );
  }
  if (bucket.menuItemId) {
    return `Menu intake · ${bucket.menuItemName || "Service menu item"}`;
  }
  return "Internal parts request";
}

function requestHref(bucket: WoBucket): string {
  if (bucket.menuItemId && !bucket.workOrderId) {
    return `/menu/item/${encodeURIComponent(bucket.menuItemId)}`;
  }
  if (!bucket.workOrderId) return "/parts";
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
  if (bucket.menuItemId && !bucket.workOrderId) {
    if (bucket.stage === "completed") return "Recipe linked and priced";
    const reviewed = items.filter(isMenuIntakeItemReviewed).length;
    return `${reviewed} of ${items.length} catalog linked and priced`;
  }
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
    <div className="mt-2.5">
      <div className="mb-1.5 text-[10px] font-medium text-[color:var(--theme-text-secondary)]">
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
  dismissingEmpty,
  handingOff,
  onDismissEmpty,
  onHandoff,
  onOpenPickOrder,
  onOpenMenuIntake,
}: {
  bucket: WoBucket;
  dismissingEmpty: boolean;
  handingOff: boolean;
  onDismissEmpty: (bucket: WoBucket) => Promise<void>;
  onHandoff: (bucket: WoBucket) => Promise<void>;
  onOpenPickOrder: (bucket: WoBucket) => void;
  onOpenMenuIntake: (bucket: WoBucket) => void;
}) {
  const meta = bucket.stage === "completed" ? null : STAGE_META[bucket.stage];
  const href = requestHref(bucket);
  const isMenuIntake = Boolean(bucket.menuItemId && !bucket.workOrderId);
  const canDismissEmpty = isDismissibleEmptyPartRequestBucket(
    bucket.models.map((model) => ({
      status: model.request.status,
      itemCount: model.items.length,
    })),
  );
  const nextAction = canDismissEmpty
    ? "No parts were added. Dismiss this abandoned request or open it to review."
    : bucket.menuItemId && !bucket.workOrderId
      ? "Link each requested part to the inventory catalog and confirm its cost on the menu item."
      : bucket.isEstimate && bucket.stage === "needs_quote"
        ? "Price every estimate item here, then complete the current revision from Estimates."
        : (meta?.next ?? "Review the completed request history.");

  return (
    <article className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3 shadow-[var(--theme-shadow-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold tracking-tight text-[color:var(--theme-text-primary)]">
            {workOrderLabel(bucket)}
          </h3>
          {bucket.customerName ? (
            <p className="mt-0.5 truncate text-sm font-medium text-[color:var(--theme-text-primary)]">
              {bucket.customerName}
            </p>
          ) : null}
          {bucket.vehicleLabel ? (
            <p className="mt-0.5 truncate text-xs text-[color:var(--theme-text-secondary)]">
              {bucket.vehicleLabel}
            </p>
          ) : null}
        </div>
        <div className="flex max-w-[52%] flex-col items-end gap-1">
          {bucket.isEstimate ? (
            <span className="truncate rounded-md border border-violet-400/35 bg-violet-400/10 px-2 py-1 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
              Estimate
              {bucket.estimateRevision
                ? ` · Rev ${bucket.estimateRevision}`
                : ""}
            </span>
          ) : null}
          {canDismissEmpty ? (
            <span className="truncate rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-[10px] font-semibold text-[color:var(--theme-text-secondary)]">
              Empty request
            </span>
          ) : meta ? (
            <span
              className={`truncate rounded-md border px-2 py-1 text-[10px] font-semibold ${meta.pill}`}
            >
              Next: {isMenuIntake ? "Review recipe" : meta.action}
            </span>
          ) : (
            <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--theme-text-secondary)]">
              Closed
            </span>
          )}
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 divide-x divide-[color:var(--theme-border-soft)] border-y border-[color:var(--theme-border-soft)] py-2 text-center">
        <div>
          <div className="text-base font-semibold leading-none text-[color:var(--theme-text-primary)]">
            {bucket.models.length}
          </div>
          <div className="text-[11px] text-[color:var(--theme-text-secondary)]">
            Request{bucket.models.length === 1 ? "" : "s"}
          </div>
        </div>
        <div>
          <div className="text-base font-semibold leading-none text-[color:var(--theme-text-primary)]">
            {bucket.items.length}
          </div>
          <div className="text-[11px] text-[color:var(--theme-text-secondary)]">
            Item{bucket.items.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="mt-2.5">
        <div className="text-[11px] font-medium text-[color:var(--theme-text-secondary)]">
          Next action
        </div>
        <p className="mt-0.5 min-h-9 text-xs leading-[18px] text-[color:var(--theme-text-primary)]">
          {nextAction}
        </p>
      </div>

      <div className="mt-2 border-t border-dashed border-[color:var(--theme-border-soft)] pt-2">
        <div className="text-[11px] font-medium text-[color:var(--theme-text-secondary)]">
          Item status
        </div>
        <span
          className={`mt-1 inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${
            meta?.pill ??
            "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)]"
          }`}
        >
          {itemStateSummary(bucket)}
        </span>
      </div>

      {!isMenuIntake ? <ProgressRail bucket={bucket} /> : null}

      {canDismissEmpty ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void onDismissEmpty(bucket)}
            disabled={dismissingEmpty}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-400/45 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-60"
          >
            {dismissingEmpty ? "Dismissing…" : "Dismiss"}
          </button>
          <Link
            href={href}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[color:var(--theme-border-strong)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-overlay)]"
          >
            Review <span aria-hidden>→</span>
          </Link>
        </div>
      ) : isMenuIntake && bucket.stage !== "completed" ? (
        <button
          type="button"
          onClick={() => onOpenMenuIntake(bucket)}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-orange-400/45 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-[color:var(--theme-accent-text)] transition hover:bg-orange-500/20"
        >
          <PackageCheck className="h-4 w-4" />
          Review menu parts
        </button>
      ) : bucket.stage === "ready_for_tech" && bucket.workOrderId ? (
        <button
          type="button"
          onClick={() => void onHandoff(bucket)}
          disabled={handingOff}
          className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 ${meta?.button}`}
        >
          <Wrench className="h-4 w-4" />
          {handingOff ? "Completing handoff…" : "Complete handoff"}
        </button>
      ) : bucket.stage === "order_receive" && bucket.workOrderId ? (
        <button
          type="button"
          onClick={() => onOpenPickOrder(bucket)}
          className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${meta?.button}`}
        >
          <ShoppingCart className="h-4 w-4" /> Open Pick / Order task
        </button>
      ) : (
        <Link
          href={href}
          className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
            meta?.button ??
            "border-[color:var(--theme-border-strong)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-overlay)]"
          }`}
        >
          {isMenuIntake
            ? "Open completed menu item"
            : (meta?.action ?? "Open history")}{" "}
          <span aria-hidden>→</span>
        </Link>
      )}
    </article>
  );
}

async function fetchPartsRequestQueue(input: {
  signal: AbortSignal;
  recordStatus: (status: number) => void;
  requestId?: string;
}): Promise<PartsRequestQueueSnapshot> {
  const params = new URLSearchParams();
  if (input.requestId) params.set("requestId", input.requestId);
  const response = await fetch(
    `/api/parts/requests/queue${params.size ? `?${params.toString()}` : ""}`,
    {
      cache: "no-store",
      signal: input.signal,
    },
  );
  input.recordStatus(response.status);
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    snapshot?: unknown;
    error?: string;
  } | null;
  if (!response.ok) {
    throw routeLoadFailureFromStatus(
      response.status,
      payload?.error || "Unable to load the Parts request queue.",
    );
  }
  if (!payload?.ok || !isPartsRequestQueueSnapshot(payload.snapshot)) {
    throw new Error("The Parts request queue returned an invalid response.");
  }
  return payload.snapshot;
}

function stageItem(item: QueueItem): PartsRequestStageItem {
  return {
    description: item.description,
    partId: item.part_id,
    requestedPartNumber: item.requested_part_number,
    requestedManufacturer: item.requested_manufacturer,
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

function Metric({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof ClipboardList;
  value: number | null;
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
    <div className="flex min-w-0 items-center gap-3 px-4 py-2.5 sm:px-5">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${colors}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-xl font-semibold leading-none text-[color:var(--theme-text-primary)]">
          {value ?? "—"}
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
  const pendingRequestIds = useRef(new Set<string>());
  const pendingFullReload = useRef(false);
  const realtimeTimer = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<PartsRequestQueueSnapshot | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<RouteLoadFailure | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [liveState, setLiveState] = useState<
    "connecting" | "live" | "degraded" | null
  >(null);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<QueueTab>("active");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [dismissingWorkOrder, setDismissingWorkOrder] = useState<string | null>(
    null,
  );
  const [handingOffWorkOrder, setHandingOffWorkOrder] = useState<string | null>(
    null,
  );
  const [pickOrderBucket, setPickOrderBucket] = useState<WoBucket | null>(null);
  const [menuIntakeBucket, setMenuIntakeBucket] = useState<WoBucket | null>(
    null,
  );

  const reload = useCallback(async () => {
    const sequence = ++reloadSequence.current;
    if (initialLoad.current) setLoading(true);
    else setRefreshing(true);

    try {
      setLoadFailure(null);
      const nextSnapshot = await runBoundedRouteLoad(
        { route: "/parts/requests", operation: "load parts request queue" },
        ({ signal, recordStatus }) =>
          fetchPartsRequestQueue({ signal, recordStatus }),
      );
      if (sequence === reloadSequence.current) setSnapshot(nextSnapshot);
    } catch (error) {
      if (sequence === reloadSequence.current) {
        setLoadFailure(
          asRouteLoadFailure(error, "Unable to load the Parts request queue."),
        );
      }
    } finally {
      if (sequence === reloadSequence.current) {
        initialLoad.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
    const onLocalChange = () => void reload();
    window.addEventListener("parts-request:submitted", onLocalChange);
    window.addEventListener("parts:received", onLocalChange);

    return () => {
      window.removeEventListener("parts-request:submitted", onLocalChange);
      window.removeEventListener("parts:received", onLocalChange);
    };
  }, [reload]);

  const reconcileRequest = useCallback(async (requestId: string) => {
    try {
      const delta = await runBoundedRouteLoad(
        {
          route: "/parts/requests",
          operation: "reconcile parts request realtime update",
        },
        ({ signal, recordStatus }) =>
          fetchPartsRequestQueue({ signal, recordStatus, requestId }),
      );
      setSnapshot((current) =>
        current
          ? reconcilePartsRequestQueueSnapshot(current, delta, requestId)
          : delta,
      );
    } catch {
      setLiveState("degraded");
      setLiveMessage(
        "A live Parts update could not be reconciled. Refresh to confirm the latest workflow state.",
      );
    }
  }, []);

  const scheduleRealtimeReconciliation = useCallback(
    (requestId: string | null) => {
      if (requestId) pendingRequestIds.current.add(requestId);
      else pendingFullReload.current = true;
      if (realtimeTimer.current !== null) return;

      realtimeTimer.current = window.setTimeout(() => {
        realtimeTimer.current = null;
        if (pendingFullReload.current) {
          pendingFullReload.current = false;
          pendingRequestIds.current.clear();
          void reload();
          return;
        }
        const requestIds = [...pendingRequestIds.current];
        pendingRequestIds.current.clear();
        void Promise.all(requestIds.map((id) => reconcileRequest(id)));
      }, 75);
    },
    [reconcileRequest, reload],
  );

  const shopId = snapshot?.shopId ?? null;
  useEffect(() => {
    if (!shopId) return;
    const effectPendingRequestIds = pendingRequestIds.current;
    let disposed = false;
    setLiveState("connecting");
    setLiveMessage(null);

    const filter = `shop_id=eq.${shopId}`;
    const channel = supabase
      .channel(`parts-request-queue:${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "part_requests",
          filter,
        },
        (payload) =>
          scheduleRealtimeReconciliation(
            readPartsRequestIdFromRealtimePayload(payload, "request"),
          ),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "part_request_items",
          filter,
        },
        (payload) =>
          scheduleRealtimeReconciliation(
            readPartsRequestIdFromRealtimePayload(payload, "item"),
          ),
      )
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          setLiveState("live");
          setLiveMessage(null);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setLiveState("degraded");
          setLiveMessage(
            "Live Parts updates are unavailable. Loaded results remain visible; use Refresh for current data.",
          );
        }
      });
    const fallback = window.setInterval(() => void reload(), 45_000);

    return () => {
      disposed = true;
      window.clearInterval(fallback);
      if (realtimeTimer.current !== null) {
        window.clearTimeout(realtimeTimer.current);
        realtimeTimer.current = null;
      }
      effectPendingRequestIds.clear();
      pendingFullReload.current = false;
      void supabase.removeChannel(channel);
    };
  }, [reload, scheduleRealtimeReconciliation, shopId, supabase]);

  const models = useMemo(
    () => (snapshot ? buildPartsRequestQueueModels(snapshot) : []),
    [snapshot],
  );
  const workOrders = useMemo(
    () =>
      Object.fromEntries(
        (snapshot?.workOrders ?? []).map((workOrder) => [
          workOrder.id,
          workOrder,
        ]),
      ) as Record<string, WorkOrderListRow>,
    [snapshot],
  );
  const menuItems = useMemo(
    () =>
      Object.fromEntries(
        (snapshot?.menuItems ?? []).map((menuItem) => [menuItem.id, menuItem]),
      ) as Record<string, MenuItemLite>,
    [snapshot],
  );

  const activeModels = useMemo(
    () => models.filter((model) => model.stage !== "completed"),
    [models],
  );
  const completedModels = useMemo(
    () => models.filter((model) => model.stage === "completed"),
    [models],
  );
  const activeBuckets = useMemo(
    () => buildBuckets(activeModels, workOrders, menuItems),
    [activeModels, menuItems, workOrders],
  );
  const completedBuckets = useMemo(
    () => buildBuckets(completedModels, workOrders, menuItems),
    [completedModels, menuItems, workOrders],
  );

  useEffect(() => {
    if (loading || tab !== "active" || pickOrderBucket) return;
    const next = activeBuckets.find(
      (bucket) => bucket.stage === "order_receive" && bucket.workOrderId,
    );
    if (!next) return;
    const fingerprint = next.models
      .map((model) => model.request.id)
      .sort()
      .join(":");
    const storageKey = `parts-pick-order-seen:${fingerprint}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // Storage can be unavailable in locked-down browser contexts.
    }
    setPickOrderBucket(next);
  }, [activeBuckets, loading, pickOrderBucket, tab]);

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

  const dismissEmptyRequests = useCallback(
    async (bucket: WoBucket) => {
      if (dismissingWorkOrder) return;

      const canDismiss = isDismissibleEmptyPartRequestBucket(
        bucket.models.map((model) => ({
          status: model.request.status,
          itemCount: model.items.length,
        })),
      );
      if (!canDismiss) {
        toast.error(
          "Only abandoned requests with no parts or pricing can be dismissed.",
        );
        return;
      }

      const requestCount = bucket.models.length;
      const confirmed = window.confirm(
        `Dismiss ${requestCount === 1 ? "this empty parts request" : `these ${requestCount} empty parts requests`}? The records will remain in Completed history.`,
      );
      if (!confirmed) return;

      setDismissingWorkOrder(bucket.bucketId);
      const toastId = toast.loading("Dismissing empty parts requests…");
      try {
        for (const model of bucket.models) {
          const response = await fetch(
            `/api/parts/requests/${model.request.id}/dismiss-empty`,
            { method: "POST" },
          );
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (!response.ok) {
            throw new Error(
              payload?.error || "Unable to dismiss the empty parts request.",
            );
          }
        }

        toast.success(
          `${requestCount === 1 ? "Request" : "Requests"} moved to Completed history.`,
          { id: toastId },
        );
        await reload();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to dismiss the empty parts requests.",
          { id: toastId },
        );
        await reload();
      } finally {
        setDismissingWorkOrder(null);
      }
    },
    [dismissingWorkOrder, reload],
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

      if (!bucket.workOrderId) {
        toast.error("A work order is required before technician handoff.");
        return;
      }
      setHandingOffWorkOrder(bucket.bucketId);
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
    <main className="w-full space-y-3 px-3 py-3 text-[color:var(--theme-text-primary)] sm:px-5 lg:px-8 xl:px-10">
      <section className="space-y-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="lg:flex lg:items-end lg:gap-8">
            <h1 className="text-3xl font-semibold tracking-tight">
              Parts Requests
            </h1>
            <div className="mt-3 flex items-center gap-6 border-b border-[color:var(--theme-border-soft)] lg:mt-0">
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
            value={snapshot ? metricBuckets.length : null}
            label={
              tab === "active" ? "Active request groups" : "Completed groups"
            }
            tone="copper"
          />
          <Metric
            icon={ListChecks}
            value={snapshot ? metricModels.length : null}
            label={tab === "active" ? "Open requests" : "Closed requests"}
            tone="amber"
          />
          <Metric
            icon={PackageCheck}
            value={
              snapshot
                ? tab === "active"
                  ? activeItemCount
                  : metricItems
                : null
            }
            label="Items"
            tone="green"
          />
        </div>
      </section>

      {loadFailure ? (
        <RouteLoadPanel
          failure={loadFailure}
          onRetry={() => void reload()}
          title="Parts request queue unavailable"
        />
      ) : null}

      {liveState === "degraded" && liveMessage ? (
        <section
          aria-live="polite"
          className="flex flex-col gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p>{liveMessage}</p>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={refreshing}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-300/40 bg-[color:var(--theme-surface-page)] px-3 font-semibold transition hover:bg-[color:var(--theme-surface-overlay)] disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh now
          </button>
        </section>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-8 text-center text-sm text-[color:var(--theme-text-secondary)]">
          Loading the live Parts workflow…
        </div>
      ) : loadFailure && models.length === 0 ? null : tab === "active" ? (
        <div
          className={`grid gap-3 ${stageFilter === "all" ? "md:grid-cols-2 xl:grid-cols-4" : "max-w-xl"}`}
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
                className={`min-w-0 self-start rounded-xl border border-t-4 border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2 ${meta.accent}`}
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

                <div className="mt-1.5 space-y-2">
                  {stageBuckets.length ? (
                    stageBuckets.map((bucket) => (
                      <QueueCard
                        key={bucket.bucketId}
                        bucket={bucket}
                        dismissingEmpty={
                          dismissingWorkOrder === bucket.bucketId
                        }
                        handingOff={handingOffWorkOrder === bucket.bucketId}
                        onDismissEmpty={dismissEmptyRequests}
                        onHandoff={completeHandoff}
                        onOpenPickOrder={setPickOrderBucket}
                        onOpenMenuIntake={setMenuIntakeBucket}
                      />
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-6 text-center text-xs text-[color:var(--theme-text-muted)]">
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
              key={bucket.bucketId}
              bucket={bucket}
              dismissingEmpty={false}
              handingOff={false}
              onDismissEmpty={dismissEmptyRequests}
              onHandoff={completeHandoff}
              onOpenPickOrder={setPickOrderBucket}
              onOpenMenuIntake={setMenuIntakeBucket}
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

      <PickOrderTaskModal
        open={pickOrderBucket !== null}
        workOrderId={pickOrderBucket?.workOrderId ?? null}
        workOrderLabel={
          pickOrderBucket ? workOrderLabel(pickOrderBucket) : "Work order"
        }
        customerName={pickOrderBucket?.customerName}
        vehicleLabel={pickOrderBucket?.vehicleLabel}
        onClose={() => setPickOrderBucket(null)}
        onChanged={reload}
      />
      <MenuItemPartsIntakeModal
        open={menuIntakeBucket !== null}
        menuItemName={menuIntakeBucket?.menuItemName || "Service menu item"}
        items={(menuIntakeBucket?.items ?? []).map(
          (item): MenuIntakeQueueItem => ({
            id: item.id,
            description: item.description,
            partId: item.part_id,
            quantity: Math.max(Number(item.qty_requested ?? item.qty ?? 1), 1),
            unitCost: item.unit_cost === null ? null : Number(item.unit_cost),
            unitPrice:
              item.unit_price === null ? null : Number(item.unit_price),
            quotedPrice:
              item.quoted_price === null ? null : Number(item.quoted_price),
          }),
        )}
        onClose={() => setMenuIntakeBucket(null)}
        onChanged={reload}
      />
    </main>
  );
}
