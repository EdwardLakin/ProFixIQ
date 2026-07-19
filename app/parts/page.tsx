"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Package,
  PackageCheck,
  Plus,
  ScanLine,
  ShoppingCart,
  Tags,
  Truck,
  Warehouse,
} from "lucide-react";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  earliestPartsRequestStage,
  toPartsRequestStage,
  type PartsRequestStage,
  type PartsRequestStageItem,
} from "@/features/parts/lib/status-display";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type StockMoveRow = DB["public"]["Tables"]["stock_moves"]["Row"];
type RequestRow = DB["public"]["Tables"]["part_requests"]["Row"];
type RequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];
type DashboardRequestItem = Pick<
  RequestItemRow,
  | "request_id"
  | "status"
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
>;

type RecentMove = Pick<
  StockMoveRow,
  | "id"
  | "created_at"
  | "reason"
  | "qty_change"
  | "part_id"
  | "reference_kind"
  | "reference_id"
>;
type TrustExtendedPart = Pick<PartRow, "id" | "created_at" | "sku"> & {
  part_number?: string | null;
  normalized_part_key?: string | null;
  import_confidence?: number | null;
};
type TrustSummary = {
  lowTrust: number;
  reviewStaging: number;
  ambiguousCandidates: number;
};
type FlowCounts = {
  needsQuote: number;
  awaitingApproval: number;
  orderReceive: number;
  readyTech: number;
  complete: number;
};

const PARTS_REQUEST_STATUSES: RequestRow["status"][] = [
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

function panelClass(extra = "") {
  return `rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] ${extra}`;
}

function approvedReceivingQty(
  item: Pick<RequestItemRow, "qty_approved">,
) {
  return Math.max(0, Number(item.qty_approved ?? 0));
}

function requestStageItem(item: DashboardRequestItem): PartsRequestStageItem {
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

function incrementFlow(flow: FlowCounts, stage: PartsRequestStage): void {
  if (stage === "needs_quote") flow.needsQuote += 1;
  else if (stage === "awaiting_approval") flow.awaitingApproval += 1;
  else if (stage === "order_receive") flow.orderReceive += 1;
  else if (stage === "ready_for_tech") flow.readyTech += 1;
  else flow.complete += 1;
}

function sourceLabel(kind: string | null, reason: string | null) {
  const key = String(kind ?? "").toLowerCase();
  if (key === "purchase_order") return "PO receive";
  if (key === "request_receive") return "Request receive";
  if (key === "manual_receive") return "Manual receive";
  if (key === "work_order") return "Work order allocation";
  return String(reason ?? (key || "movement")).replaceAll("_", " ");
}

function MetricCard({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href: string;
  icon: typeof Package;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-20 items-center gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-3 transition hover:border-[var(--brand-accent,#E39A6E)]/55"
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white ${tone}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-[color:var(--theme-text-secondary)]">
          {label}
        </span>
        <span className="block text-2xl font-bold text-[color:var(--theme-text-primary)]">
          {value}
        </span>
        {hint ? (
          <span className="block truncate text-[11px] text-[color:var(--theme-text-muted)]">
            {hint}
          </span>
        ) : null}
      </span>
      <ChevronRight className="h-4 w-4 text-[color:var(--theme-text-muted)] transition group-hover:translate-x-0.5" />
    </Link>
  );
}

export default function PartsDashboardPage(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [loading, setLoading] = useState(true);
  const [skuTotal, setSkuTotal] = useState(0);
  const [skuNewThis7d, setSkuNewThis7d] = useState(0);
  const [moves7dCount, setMoves7dCount] = useState(0);
  const [openRequestCount, setOpenRequestCount] = useState(0);
  const [openWorkOrderCount, setOpenWorkOrderCount] = useState(0);
  const [openItemCount, setOpenItemCount] = useState(0);
  const [openPoCount, setOpenPoCount] = useState(0);
  const [receiveQueueCount, setReceiveQueueCount] = useState(0);
  const [flow, setFlow] = useState<FlowCounts>({
    needsQuote: 0,
    awaitingApproval: 0,
    orderReceive: 0,
    readyTech: 0,
    complete: 0,
  });
  const [trustSummary, setTrustSummary] = useState<TrustSummary>({
    lowTrust: 0,
    reviewStaging: 0,
    ambiguousCandidates: 0,
  });
  const [partNameById, setPartNameById] = useState<
    Record<string, { name: string | null; sku: string | null }>
  >({});
  const [recentMoves, setRecentMoves] = useState<RecentMove[]>([]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const now = new Date();
      const d7Ago = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      const d30Ago = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

      const [
        partsRes,
        movesRes,
        openPoRes,
        stagingRes,
        candidateRes,
      ] = await Promise.all([
        supabase
          .from("parts")
          .select(
            "id, created_at, sku, part_number, normalized_part_key, import_confidence, source_intake_id",
          ),
        supabase
          .from("stock_moves")
          .select(
            "id, part_id, qty_change, reason, created_at, reference_kind, reference_id",
          )
          .gte("created_at", d30Ago.toISOString())
          .order("created_at", { ascending: true }),
        supabase
          .from("purchase_orders")
          .select("id", { count: "exact", head: true })
          .in("status", ["draft", "sent", "partially_received"]),
        supabase.from("shop_parts_import_staging").select("status"),
        supabase
          .from("shop_parts_import_match_candidates")
          .select("staging_id, candidate_part_id"),
      ]);

      const partsRows = (partsRes.data ?? []) as TrustExtendedPart[];
      setSkuTotal(partsRows.length);
      setSkuNewThis7d(
        partsRows.filter(
          (part) =>
            !!part.created_at &&
            new Date(part.created_at) >= d7Ago &&
            new Date(part.created_at) < now,
        ).length,
      );
      const lowTrust = partsRows.filter(
        (part) =>
          !part.sku?.trim() ||
          !part.part_number?.trim() ||
          !part.normalized_part_key?.trim() ||
          (typeof part.import_confidence === "number" &&
            part.import_confidence < 0.75),
      ).length;
      const reviewStaging = (stagingRes.data ?? []).filter((row) =>
        ["pending", "review", "ambiguous"].includes(
          String(row.status ?? "").toLowerCase(),
        ),
      ).length;
      const candidateCounts: Record<string, number> = {};
      for (const row of candidateRes.data ?? []) {
        const key = String(row.staging_id ?? row.candidate_part_id ?? "");
        if (key) candidateCounts[key] = (candidateCounts[key] ?? 0) + 1;
      }
      setTrustSummary({
        lowTrust,
        reviewStaging,
        ambiguousCandidates: Object.values(candidateCounts).filter(
          (count) => count > 1,
        ).length,
      });

      const moves = (movesRes.data ?? []) as RecentMove[];
      setMoves7dCount(
        moves.filter((move) => new Date(String(move.created_at)) >= d7Ago)
          .length,
      );
      const recent = [...moves]
        .sort(
          (a, b) =>
            new Date(String(b.created_at)).getTime() -
            new Date(String(a.created_at)).getTime(),
        )
        .slice(0, 8);
      setRecentMoves(recent);
      const partIds = [
        ...new Set(
          recent.map((move) => String(move.part_id ?? "")).filter(Boolean),
        ),
      ];
      if (partIds.length) {
        const partInfo = await supabase
          .from("parts")
          .select("id, name, sku")
          .in("id", partIds);
        const names: Record<
          string,
          { name: string | null; sku: string | null }
        > = {};
        for (const part of partInfo.data ?? []) {
          names[String(part.id)] = {
            name: part.name ?? null,
            sku: part.sku ?? null,
          };
        }
        setPartNameById(names);
      }

      const requests: Array<
        Pick<RequestRow, "id" | "status" | "work_order_id">
      > = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const page = await supabase
          .from("part_requests")
          .select("id,status,work_order_id")
          .in("status", PARTS_REQUEST_STATUSES)
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (page.error) throw page.error;
        const rows = (page.data ?? []) as typeof requests;
        requests.push(...rows);
        if (rows.length < pageSize) break;
      }

      const requestIds = requests.map((request) => request.id);
      const items: DashboardRequestItem[] = [];
      for (let chunkStart = 0; chunkStart < requestIds.length; chunkStart += 200) {
        const requestIdChunk = requestIds.slice(chunkStart, chunkStart + 200);
        for (let offset = 0; ; offset += pageSize) {
          const page = await supabase
            .from("part_request_items")
            .select(
              "request_id,status,description,part_id,quoted_price,unit_price,qty,qty_requested,qty_approved,qty_ordered,qty_received,qty_reserved,qty_consumed,qty_returned",
            )
            .in("request_id", requestIdChunk)
            .order("id", { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (page.error) throw page.error;
          const rows = (page.data ?? []) as typeof items;
          items.push(...rows);
          if (rows.length < pageSize) break;
        }
      }
      const itemsByRequest = new Map<string, typeof items>();
      for (const item of items) {
        const current = itemsByRequest.get(item.request_id) ?? [];
        current.push(item);
        itemsByRequest.set(item.request_id, current);
      }

      const requestStages = requests.map((request) => ({
        request,
        stage: toPartsRequestStage({
          rawStatus: request.status,
          items: (itemsByRequest.get(request.id) ?? []).map(requestStageItem),
        }),
      }));
      const activeRequests = requestStages
        .filter((model) => model.stage !== "completed")
        .map((model) => model.request);
      setOpenRequestCount(activeRequests.length);
      setOpenWorkOrderCount(
        new Set(
          activeRequests
            .map((request) => request.work_order_id)
            .filter((id): id is string => Boolean(id)),
        ).size,
      );
      const activeIds = new Set(activeRequests.map((request) => request.id));
      setOpenItemCount(
        items.filter(
          (item) =>
            activeIds.has(item.request_id) &&
            String(item.status).toLowerCase() !== "cancelled",
        ).length,
      );
      setOpenPoCount(openPoRes.count ?? 0);
      setReceiveQueueCount(
        items.filter((item) => {
          const target = approvedReceivingQty(item);
          return (
            activeIds.has(item.request_id) &&
            String(item.status).toLowerCase() !== "cancelled" &&
            target > 0 &&
            Number(item.qty_received ?? 0) < target &&
            Number(item.qty_consumed ?? 0) < target
          );
        }).length,
      );

      const nextFlow: FlowCounts = {
        needsQuote: 0,
        awaitingApproval: 0,
        orderReceive: 0,
        readyTech: 0,
        complete: 0,
      };
      const stagesByWorkOrder = new Map<string, PartsRequestStage[]>();
      for (const model of requestStages) {
        const key = model.request.work_order_id ?? `request:${model.request.id}`;
        stagesByWorkOrder.set(key, [
          ...(stagesByWorkOrder.get(key) ?? []),
          model.stage,
        ]);
      }
      for (const stages of stagesByWorkOrder.values()) {
        incrementFlow(nextFlow, earliestPartsRequestStage(stages));
      }
      setFlow(nextFlow);
      setLoading(false);
    })();
  }, [supabase]);

  const display = (value: number) => (loading ? "…" : value.toLocaleString());
  const attention = [
    {
      label: "parts requests need a quote",
      value: flow.needsQuote,
      context: "Quote queue",
      action: "Start quoting",
      href: "/parts/requests",
    },
    {
      label: "requests await approval",
      value: flow.awaitingApproval,
      context: "Customer decision",
      action: "Review approvals",
      href: "/parts/requests",
    },
    {
      label: "items need receiving",
      value: receiveQueueCount,
      context: "Receiving inbox",
      action: "Receive parts",
      href: "/parts/receiving",
    },
    {
      label: "catalog records need review",
      value: trustSummary.lowTrust + trustSummary.reviewStaging,
      context: "Catalog quality",
      action: "Review catalog",
      href: "/parts/inventory",
    },
  ].filter((item) => item.value > 0);
  const partsFlow = [
    {
      label: "Needs Quote",
      value: flow.needsQuote,
      href: "/parts/requests",
      icon: ClipboardList,
      tone: "text-blue-600",
    },
    {
      label: "Awaiting Approval",
      value: flow.awaitingApproval,
      href: "/parts/requests",
      icon: Clock3,
      tone: "text-amber-600",
    },
    {
      label: "Order & Receive",
      value: flow.orderReceive,
      href: "/parts/receiving",
      icon: Truck,
      tone: "text-orange-600",
    },
    {
      label: "Ready for Tech",
      value: flow.readyTech,
      href: "/parts/requests",
      icon: PackageCheck,
      tone: "text-emerald-600",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-[1800px] space-y-4 p-3 text-[color:var(--theme-text-primary)] sm:p-4 lg:p-5">
      <header className="flex flex-col gap-4 px-1 py-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Parts Overview</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-[color:var(--theme-text-secondary)]">
            <span>Requests, receiving, inventory, and purchasing</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Live operations</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/parts/requests"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 text-sm font-semibold"
          >
            <ClipboardList className="h-4 w-4" /> Open requests
          </Link>
          <Link
            href="/parts/po"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary,#C1663B)] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> Create purchase order
          </Link>
        </div>
      </header>

      <section
        className={`${panelClass("p-3")} grid gap-2 sm:grid-cols-2 lg:grid-cols-5`}
      >
        <MetricCard
          label="Active work orders"
          value={display(openWorkOrderCount)}
          hint="With open parts demand"
          href="/parts/requests"
          icon={Boxes}
          tone="bg-blue-600"
        />
        <MetricCard
          label="Open requests"
          value={display(openRequestCount)}
          hint="Request records"
          href="/parts/requests"
          icon={ClipboardList}
          tone="bg-violet-600"
        />
        <MetricCard
          label="Open items"
          value={display(openItemCount)}
          hint="Individual requested items"
          href="/parts/requests"
          icon={Package}
          tone="bg-orange-600"
        />
        <MetricCard
          label="Awaiting receiving"
          value={display(receiveQueueCount)}
          hint="Approved item quantities"
          href="/parts/receiving"
          icon={Truck}
          tone="bg-teal-600"
        />
        <MetricCard
          label="Open purchase orders"
          value={display(openPoCount)}
          hint="Draft, sent, or partial"
          href="/parts/po/receive"
          icon={ShoppingCart}
          tone="bg-green-600"
        />
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(300px,0.95fr)]">
        <div className="space-y-3">
          <section className={panelClass("overflow-hidden")}>
            <div className="p-4">
              <h2 className="text-xl font-bold">Needs attention</h2>
              <p className="text-sm text-[color:var(--theme-text-secondary)]">
                Parts work that can delay active repairs
              </p>
            </div>
            {attention.length ? (
              <div className="divide-y divide-[color:var(--theme-border-soft)] border-y border-[color:var(--theme-border-soft)]">
                {attention.map((item, index) => (
                  <div
                    key={item.label}
                    className="grid gap-3 border-l-4 border-l-[var(--brand-accent,#E39A6E)] px-4 py-3 sm:grid-cols-[48px_minmax(0,1.4fr)_minmax(120px,0.8fr)_auto] sm:items-center"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--brand-accent,#E39A6E)]/15 font-bold text-[var(--brand-primary,#C1663B)]">
                      {index + 1}
                    </span>
                    <div>
                      <div className="font-semibold">
                        <span className="mr-1 text-lg">{item.value}</span>
                        {item.label}
                      </div>
                      <div className="text-xs text-[color:var(--theme-text-muted)]">
                        Operational priority
                      </div>
                    </div>
                    <div className="text-sm text-[color:var(--theme-text-secondary)]">
                      <div>{item.context}</div>
                      <div className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--brand-primary,#C1663B)]">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Action available
                      </div>
                    </div>
                    <Link
                      href={item.href}
                      className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-sm font-semibold hover:bg-[color:var(--theme-surface-subtle)]"
                    >
                      {item.action}
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-y border-[color:var(--theme-border-soft)] p-6 text-sm text-[color:var(--theme-text-secondary)]">
                No parts bottlenecks need attention right now.
              </div>
            )}
            <Link
              href="/parts/requests"
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--brand-primary,#C1663B)]"
            >
              View all parts requests <ArrowRight className="h-4 w-4" />
            </Link>
          </section>

          <section className={panelClass("p-4")}>
            <h2 className="text-lg font-bold">Parts flow</h2>
            <p className="text-sm text-[color:var(--theme-text-secondary)]">
              Active requests by their next operational step
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {partsFlow.map(({ label, value, href, icon: Icon, tone }) => (
                <Link
                  key={label}
                  href={href}
                  className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 transition hover:border-[var(--brand-accent,#E39A6E)]/55"
                >
                  <div className="flex items-center gap-2 text-sm text-[color:var(--theme-text-secondary)]">
                    <Icon className={`h-4 w-4 ${tone}`} />
                    <span className="flex-1">{label}</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                  <div className={`mt-2 text-2xl font-bold ${tone}`}>
                    {display(value)}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--theme-surface-inset)]">
                    <div
                      className="h-full rounded-full bg-[var(--brand-primary,#C1663B)]"
                      style={{ width: `${Math.min(100, value * 20)}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[color:var(--theme-border-soft)] pt-3 text-sm">
              <span className="text-[color:var(--theme-text-secondary)]">
                Completed requests are kept out of active counts.
              </span>
              <Link
                href="/parts/requests"
                className="inline-flex items-center gap-1 font-semibold text-[var(--brand-primary,#C1663B)]"
              >
                Completed history · {display(flow.complete)}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </section>

          <section className={panelClass("overflow-hidden")}>
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <h2 className="text-lg font-bold">Recent inventory movement</h2>
                <p className="text-sm text-[color:var(--theme-text-secondary)]">
                  Latest stock changes with source traceability
                </p>
              </div>
              <Link
                href="/parts/movements"
                className="inline-flex items-center gap-1 text-sm font-semibold"
              >
                View ledger <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            {loading ? (
              <div className="border-t border-[color:var(--theme-border-soft)] p-5 text-sm text-[color:var(--theme-text-secondary)]">
                Loading inventory activity…
              </div>
            ) : recentMoves.length === 0 ? (
              <div className="border-t border-[color:var(--theme-border-soft)] p-5 text-sm text-[color:var(--theme-text-secondary)]">
                No stock movement in the last 30 days.
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--theme-border-soft)] border-t border-[color:var(--theme-border-soft)]">
                {recentMoves.map((move) => {
                  const qty = Number(move.qty_change ?? 0);
                  const part = partNameById[String(move.part_id)] ?? null;
                  return (
                    <li
                      key={move.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span
                        className={`grid h-9 w-9 place-items-center rounded-lg ${qty >= 0 ? "bg-emerald-500/12 text-emerald-600" : "bg-rose-500/12 text-rose-600"}`}
                      >
                        <Warehouse className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {part?.name ??
                            String(move.reason ?? "Stock movement").replaceAll(
                              "_",
                              " ",
                            )}
                        </span>
                        <span className="block truncate text-xs text-[color:var(--theme-text-muted)]">
                          {part?.sku ? `${part.sku} · ` : ""}
                          {sourceLabel(
                            move.reference_kind ?? null,
                            move.reason ?? null,
                          )}{" "}
                          · {new Date(String(move.created_at)).toLocaleString()}
                        </span>
                      </span>
                      <strong
                        className={
                          qty >= 0 ? "text-emerald-600" : "text-rose-600"
                        }
                      >
                        {qty >= 0 ? "+" : ""}
                        {qty}
                      </strong>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-3">
          <section className={panelClass("p-4")}>
            <h2 className="text-xl font-bold">Today&apos;s pulse</h2>
            <p className="text-sm text-[color:var(--theme-text-secondary)]">
              Live parts activity and inventory posture
            </p>
            <div className="mt-3 space-y-2">
              {[
                {
                  label: "Stock moves (7 days)",
                  value: moves7dCount,
                  icon: Warehouse,
                  href: "/parts/movements",
                },
                {
                  label: "New catalog SKUs (7 days)",
                  value: skuNewThis7d,
                  icon: Tags,
                  href: "/parts/inventory",
                },
                {
                  label: "Total catalog SKUs",
                  value: skuTotal,
                  icon: Boxes,
                  href: "/parts/inventory",
                },
                {
                  label: "Ready for technician",
                  value: flow.readyTech,
                  icon: CheckCircle2,
                  href: "/parts/requests",
                },
              ].map(({ label, value, icon: Icon, href }) => (
                <Link
                  key={label}
                  href={href}
                  className="flex items-center gap-3 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2.5"
                >
                  <Icon className="h-5 w-5 text-[var(--brand-primary,#C1663B)]" />
                  <span className="flex-1 text-sm text-[color:var(--theme-text-secondary)]">
                    {label}
                  </span>
                  <strong className="text-xl">{display(value)}</strong>
                </Link>
              ))}
            </div>
          </section>

          <section className={panelClass("p-4")}>
            <h2 className="text-xl font-bold">Action rail</h2>
            <p className="text-sm text-[color:var(--theme-text-secondary)]">
              Shortcuts to keep parts moving
            </p>
            <div className="mt-3 space-y-2">
              {[
                {
                  label: "Receive parts",
                  detail: "Process the receiving inbox",
                  href: "/parts/receiving",
                  icon: Truck,
                },
                {
                  label: "Scan to receive",
                  detail: "Receive by barcode or part number",
                  href: "/parts/receive",
                  icon: ScanLine,
                },
                {
                  label: "Manage inventory",
                  detail: "Search and maintain catalog stock",
                  href: "/parts/inventory",
                  icon: Warehouse,
                },
                {
                  label: "Review purchase orders",
                  detail: "Open, partial, and completed POs",
                  href: "/parts/po/receive",
                  icon: ShoppingCart,
                },
              ].map(({ label, detail, href, icon: Icon }) => (
                <Link
                  key={label}
                  href={href}
                  className="group flex items-center gap-3 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2.5"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--brand-primary,#C1663B)]/12 text-[var(--brand-primary,#C1663B)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block truncate text-xs text-[color:var(--theme-text-muted)]">
                      {detail}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </section>

          <section className={panelClass("p-4")}>
            <h2 className="text-xl font-bold">Catalog health</h2>
            <p className="text-sm text-[color:var(--theme-text-secondary)]">
              Records that need cleanup or review
            </p>
            <div className="mt-3 space-y-2">
              {[
                ["Low-trust records", trustSummary.lowTrust],
                ["Imports needing review", trustSummary.reviewStaging],
                ["Ambiguous matches", trustSummary.ambiguousCandidates],
              ].map(([label, value]) => (
                <Link
                  key={String(label)}
                  href="/parts/inventory"
                  className="flex items-center gap-3 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2.5"
                >
                  <AlertTriangle
                    className={`h-4 w-4 ${Number(value) > 0 ? "text-amber-600" : "text-emerald-600"}`}
                  />
                  <span className="flex-1 text-sm text-[color:var(--theme-text-secondary)]">
                    {label}
                  </span>
                  <strong>{display(Number(value))}</strong>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
