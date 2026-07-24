"use client";

import { ArrowDownToLine, ArrowUpFromLine, Minus, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  partIdentifierLabel,
  toPartDisplaySummary,
} from "@/features/parts/lib/part-display";
import PageShell from "@/features/shared/components/PageShell";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type StockMove = DB["public"]["Tables"]["stock_moves"]["Row"];
type PartLite = Pick<
  DB["public"]["Tables"]["parts"]["Row"],
  "id" | "name" | "sku" | "part_number" | "category" | "price"
>;
type LocLite = Pick<
  DB["public"]["Tables"]["stock_locations"]["Row"],
  "id" | "code" | "name"
>;
type RequestItemLite = Pick<
  DB["public"]["Tables"]["part_request_items"]["Row"],
  "id" | "work_order_id"
>;
type AllocationLite = Pick<
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"],
  "stock_move_id" | "work_order_id" | "source_request_item_id"
>;

type RefContext = {
  workOrderId?: string | null;
  requestItemId?: string | null;
  sourceLabel: string;
};
type DirectionFilter = "all" | "in" | "out" | "unchanged";
type MovementDirection = Exclude<DirectionFilter, "all">;

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

function movementDirection(qty: number): MovementDirection {
  if (qty > 0) return "in";
  if (qty < 0) return "out";
  return "unchanged";
}

function movementBadge(qty: number): {
  label: string;
  className: string;
  icon: typeof ArrowDownToLine;
} {
  if (qty > 0) {
    return {
      label: "Stock in",
      className:
        "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-950/45 dark:text-emerald-100",
      icon: ArrowDownToLine,
    };
  }
  if (qty < 0) {
    return {
      label: "Stock out",
      className:
        "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-500/55 dark:bg-rose-950/45 dark:text-rose-100",
      icon: ArrowUpFromLine,
    };
  }
  return {
    label: "No change",
    className:
      "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-500/50 dark:bg-slate-800/65 dark:text-slate-100",
    icon: Minus,
  };
}

function MovementBadge({ qty }: { qty: number }) {
  const badge = movementBadge(qty);
  const Icon = badge.icon;
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-sm font-bold tabular-nums ${badge.className}`}
      title={`${badge.label}: ${Math.abs(qty)}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span>
        {qty > 0 ? "+" : ""}
        {qty}
      </span>
      <span className="sr-only">{badge.label}</span>
    </span>
  );
}

function SummaryFilter({
  active,
  count,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
  tone: "neutral" | MovementDirection;
}) {
  const toneClass = {
    neutral: "text-[color:var(--theme-text-primary)]",
    in: "text-emerald-700 dark:text-emerald-200",
    out: "text-rose-800 dark:text-rose-100",
    unchanged: "text-[color:var(--theme-text-secondary)]",
  }[tone];

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`desktop-panel-soft min-h-20 p-3 text-left transition hover:border-[color:var(--theme-border-strong)] ${
        active ? "ring-2 ring-cyan-500/45" : ""
      }`}
    >
      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
        {label}
      </span>
      <span
        className={`mt-1 block text-2xl font-bold tabular-nums ${toneClass}`}
      >
        {count}
      </span>
    </button>
  );
}

function TraceLinks({ context }: { context: RefContext | null }) {
  return (
    <div className="flex flex-wrap gap-2">
      {context?.workOrderId ? (
        <Link
          className="desktop-link-chip hover:text-[color:var(--theme-text-primary)]"
          href={`/work-orders/${encodeURIComponent(context.workOrderId)}`}
        >
          Work order
        </Link>
      ) : (
        <span className="text-[color:var(--theme-text-muted)]">
          No work order link
        </span>
      )}
      {context?.requestItemId ? (
        <span className="desktop-link-chip">
          Request {context.requestItemId.slice(0, 8)}
        </span>
      ) : null}
    </div>
  );
}

function sourceLabel(kind: string | null, reason: string | null): string {
  const k = String(kind ?? "").toLowerCase();
  if (k === "purchase_order") return "PO receive";
  if (k === "manual_receive") return "Manual receive";
  if (k === "request_receive") return "Request receive";
  if (k === "work_order") return "Work order allocation";
  if (k === "csv_import") return "CSV import";
  if (reason === "consume" || reason === "wo_allocate") {
    return "Work order consumption";
  }
  return k || String(reason ?? "movement");
}

function reasonLabel(reason: string | null): string {
  const key = String(reason ?? "").toLowerCase();
  if (key === "wo_allocate" || key === "consume") {
    return "Allocated to work order";
  }
  if (key === "po_receive") return "Received from purchase order";
  if (key === "request_receive") return "Received for request item";
  if (key === "manual_receive") return "Manual receive adjustment";
  return key ? key.replaceAll("_", " ") : "Movement update";
}

async function resolveShopId(
  supabase: ReturnType<typeof createBrowserSupabase>,
) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  if (!uid) return "";
  const { data: profA } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("user_id", uid)
    .maybeSingle();
  if (profA?.shop_id) return String(profA.shop_id);
  const { data: profB } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", uid)
    .maybeSingle();
  return String(profB?.shop_id ?? "");
}

export default function StockMovementsPage(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [parts, setParts] = useState<Record<string, PartLite>>({});
  const [locs, setLocs] = useState<Record<string, LocLite>>({});
  const [ctxMap, setCtxMap] = useState<Record<string, RefContext>>({});
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const sid = await resolveShopId(supabase);
    if (!sid) {
      setLoading(false);
      return;
    }

    const { data: mv, error } = await supabase
      .from("stock_moves")
      .select(
        "id, part_id, location_id, qty_change, reason, reference_kind, reference_id, created_at, shop_id",
      )
      .eq("shop_id", sid)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    const rows = (mv ?? []) as StockMove[];
    setMoves(rows);

    const partIds = [
      ...new Set(rows.map((r) => String(r.part_id)).filter(Boolean)),
    ];
    const locIds = [
      ...new Set(rows.map((r) => String(r.location_id)).filter(Boolean)),
    ];
    const requestItemRefs = [
      ...new Set(
        rows
          .filter(
            (r) =>
              String(r.reference_kind ?? "") === "request_receive" &&
              r.reference_id,
          )
          .map((r) => String(r.reference_id)),
      ),
    ];
    const stockMoveRefs = [
      ...new Set(
        rows
          .filter(
            (r) =>
              String(r.reference_kind ?? "") === "work_order" && r.reference_id,
          )
          .map((r) => String(r.reference_id)),
      ),
    ];

    const [pr, lr, reqItems, allocs] = await Promise.all([
      partIds.length
        ? supabase
            .from("parts")
            .select("id,name,sku,part_number,category,price")
            .in("id", partIds)
        : Promise.resolve({ data: [] as PartLite[] }),
      locIds.length
        ? supabase
            .from("stock_locations")
            .select("id,code,name")
            .in("id", locIds)
        : Promise.resolve({ data: [] as LocLite[] }),
      requestItemRefs.length
        ? supabase
            .from("part_request_items")
            .select("id,work_order_id")
            .in("id", requestItemRefs)
        : Promise.resolve({ data: [] as RequestItemLite[] }),
      stockMoveRefs.length
        ? supabase
            .from("work_order_part_allocations")
            .select("stock_move_id,work_order_id,source_request_item_id")
            .in("stock_move_id", stockMoveRefs)
        : Promise.resolve({ data: [] as AllocationLite[] }),
    ]);

    const partMap: Record<string, PartLite> = {};
    (pr.data ?? []).forEach((x) => {
      partMap[String(x.id)] = x;
    });
    setParts(partMap);

    const locMap: Record<string, LocLite> = {};
    (lr.data ?? []).forEach((x) => {
      locMap[String(x.id)] = x;
    });
    setLocs(locMap);

    const context: Record<string, RefContext> = {};
    (reqItems.data ?? []).forEach((r) => {
      context[String(r.id)] = {
        workOrderId: r.work_order_id ?? null,
        requestItemId: String(r.id),
        sourceLabel: "Request receive",
      };
    });
    (allocs.data ?? []).forEach((a) => {
      context[String(a.stock_move_id)] = {
        workOrderId: a.work_order_id ?? null,
        requestItemId: a.source_request_item_id ?? null,
        sourceLabel: "WO allocation",
      };
    });
    setCtxMap(context);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () =>
      moves.reduce(
        (result, move) => {
          result[movementDirection(n(move.qty_change))] += 1;
          return result;
        },
        { in: 0, out: 0, unchanged: 0 },
      ),
    [moves],
  );

  const filteredMoves = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return moves.filter((move) => {
      const qty = n(move.qty_change);
      if (direction !== "all" && movementDirection(qty) !== direction) {
        return false;
      }
      if (!normalizedQuery) return true;
      const part = parts[String(move.part_id)];
      const loc = locs[String(move.location_id)];
      const refId = String(move.reference_id ?? "");
      const context = ctxMap[refId] ?? ctxMap[String(move.id)] ?? null;
      return [
        part?.name,
        part?.sku,
        part?.part_number,
        loc?.code,
        loc?.name,
        context?.sourceLabel ?? sourceLabel(move.reference_kind, move.reason),
        reasonLabel(move.reason),
        context?.workOrderId,
        context?.requestItemId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [ctxMap, direction, locs, moves, parts, query]);

  return (
    <PageShell
      eyebrow="Parts · Traceability"
      title="Stock movement ledger"
      description="Follow every inventory increase, decrease, and source record from one readable ledger."
      actions={
        <>
          <Link href="/parts" className={ui.buttonSecondary}>
            Parts
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className={ui.buttonSecondary}
          >
            Refresh
          </button>
        </>
      }
    >
      <div className="space-y-4 text-[color:var(--theme-text-primary)]">
        <section
          aria-label="Movement filters"
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <SummaryFilter
            active={direction === "all"}
            count={moves.length}
            label="All movements"
            onClick={() => setDirection("all")}
            tone="neutral"
          />
          <SummaryFilter
            active={direction === "in"}
            count={counts.in}
            label="Stock in"
            onClick={() => setDirection("in")}
            tone="in"
          />
          <SummaryFilter
            active={direction === "out"}
            count={counts.out}
            label="Stock out"
            onClick={() => setDirection("out")}
            tone="out"
          />
          <SummaryFilter
            active={direction === "unchanged"}
            count={counts.unchanged}
            label="No change"
            onClick={() => setDirection("unchanged")}
            tone="unchanged"
          />
        </section>

        <div className="desktop-toolbar-row p-3">
          <label className="relative block w-full">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]"
            />
            <span className="sr-only">Search stock movements</span>
            <input
              className={`${ui.input} pl-9`}
              placeholder="Search part, SKU, location, source, work order…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        {err ? (
          <div
            role="alert"
            className="desktop-panel-soft border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800 dark:border-red-500/40 dark:bg-red-950/45 dark:text-red-100"
          >
            {err}
          </div>
        ) : null}

        {loading ? (
          <div className={ui.loadingState}>Loading movements…</div>
        ) : filteredMoves.length === 0 ? (
          <div className={ui.emptyState}>
            {moves.length === 0
              ? "No stock movements have been recorded."
              : "No movements match the current filters."}
          </div>
        ) : (
          <>
            <div className="space-y-3 xl:hidden">
              {filteredMoves.map((move) => {
                const part = parts[String(move.part_id)];
                const partSummary = part ? toPartDisplaySummary(part) : null;
                const loc = locs[String(move.location_id)];
                const qty = n(move.qty_change);
                const refId = String(move.reference_id ?? "");
                const context =
                  ctxMap[refId] ?? ctxMap[String(move.id)] ?? null;
                return (
                  <article
                    key={String(move.id)}
                    className="desktop-panel-soft space-y-4 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-[color:var(--theme-text-primary)]">
                          {partSummary?.name ?? "Unknown part"}
                        </h2>
                        {partSummary &&
                        partSummary.labeledIdentifiers.length > 0 ? (
                          <p className="mt-0.5 text-sm text-[color:var(--theme-text-muted)]">
                            {partIdentifierLabel(partSummary)}
                          </p>
                        ) : null}
                      </div>
                      <MovementBadge qty={qty} />
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                          Location
                        </dt>
                        <dd className="mt-1 font-medium">
                          {loc?.code ?? "LOC"}{" "}
                          <span className="font-normal text-[color:var(--theme-text-secondary)]">
                            {loc?.name ?? ""}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                          Time
                        </dt>
                        <dd className="mt-1 text-[color:var(--theme-text-secondary)]">
                          {move.created_at
                            ? new Date(move.created_at).toLocaleString()
                            : "—"}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs font-medium uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                          Source
                        </dt>
                        <dd className="mt-1 font-medium">
                          {context?.sourceLabel ??
                            sourceLabel(move.reference_kind, move.reason)}
                        </dd>
                        <dd className="text-sm text-[color:var(--theme-text-muted)]">
                          {reasonLabel(move.reason)}
                        </dd>
                      </div>
                    </dl>

                    <div className="border-t border-[color:var(--desktop-border)] pt-3 text-sm">
                      <TraceLinks context={context} />
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="desktop-panel-soft hidden overflow-hidden xl:block">
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="sticky top-0 z-10 bg-[color:var(--theme-surface-page)] shadow-[0_1px_0_var(--desktop-border)]">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                      <th className="p-3.5">Time</th>
                      <th className="p-3.5">Part</th>
                      <th className="p-3.5">Location</th>
                      <th className="p-3.5">Movement</th>
                      <th className="p-3.5">Source</th>
                      <th className="p-3.5">Trace links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMoves.map((move) => {
                      const part = parts[String(move.part_id)];
                      const partSummary = part
                        ? toPartDisplaySummary(part)
                        : null;
                      const loc = locs[String(move.location_id)];
                      const qty = n(move.qty_change);
                      const refId = String(move.reference_id ?? "");
                      const context =
                        ctxMap[refId] ?? ctxMap[String(move.id)] ?? null;
                      return (
                        <tr
                          key={String(move.id)}
                          className="border-t border-[color:var(--desktop-border)] align-top transition hover:bg-[color:var(--theme-surface-subtle)]"
                        >
                          <td className="whitespace-nowrap p-4 text-sm text-[color:var(--theme-text-secondary)]">
                            {move.created_at
                              ? new Date(move.created_at).toLocaleString()
                              : "—"}
                          </td>
                          <td className="p-4">
                            <div className="font-semibold text-[color:var(--theme-text-primary)]">
                              {partSummary?.name ?? "Unknown part"}
                            </div>
                            {partSummary &&
                            partSummary.labeledIdentifiers.length > 0 ? (
                              <div className="mt-0.5 text-sm text-[color:var(--theme-text-muted)]">
                                {partIdentifierLabel(partSummary)}
                              </div>
                            ) : null}
                          </td>
                          <td className="p-4 font-medium text-[color:var(--theme-text-primary)]">
                            {loc?.code ?? "LOC"}{" "}
                            <span className="font-normal text-[color:var(--theme-text-muted)]">
                              {loc?.name ?? ""}
                            </span>
                          </td>
                          <td className="p-4">
                            <MovementBadge qty={qty} />
                          </td>
                          <td className="p-4">
                            <div className="font-medium text-[color:var(--theme-text-primary)]">
                              {context?.sourceLabel ??
                                sourceLabel(move.reference_kind, move.reason)}
                            </div>
                            <div className="mt-0.5 text-sm text-[color:var(--theme-text-muted)]">
                              {reasonLabel(move.reason)}
                            </div>
                          </td>
                          <td className="p-4 text-sm">
                            <TraceLinks context={context} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
