"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";
import { requestFlowLabel, toItemFlowDisplay, toRequestFlowDisplay } from "@/features/parts/lib/status-display";

type DB = Database;

type PartRequest = DB["public"]["Tables"]["part_requests"]["Row"];
type PartRequestItem = DB["public"]["Tables"]["part_request_items"]["Row"];

type BucketStatus = "pending" | "in_progress" | "ready" | "complete";

type WoBucket = {
  workOrderId: string;
  customId: string | null;
  customerName: string | null;
  vehicleLabel: string | null;
  status: BucketStatus;
  requests: PartRequest[];
  itemsCount: number;
  completeCount: number;
  completionPct: number;
  latestAt: string | null;
  searchBlob: string;
};

type WorkOrderListRow = {
  id: string;
  custom_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  customers:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
  vehicles:
    | { year: string | number | null; make: string | null; model: string | null }
    | { year: string | number | null; make: string | null; model: string | null }[]
    | null;
};

const VISIBLE_STATUSES: PartRequest["status"][] = [
  "requested",
  "quoted",
  "approved",
  "fulfilled",
];

function looksLikeUuid(s: string): boolean {
  return s.includes("-") && s.length >= 36;
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isCompleteItem(
  it: Pick<
    PartRequestItem,
    "part_id" | "qty" | "quoted_price" | "description"
  >,
): boolean {
  const hasPart = typeof it.part_id === "string" && it.part_id.length > 0;
  const qty = toNum(it.qty);
  const hasQty = qty > 0;
  const hasPrice =
    it.quoted_price != null && Number.isFinite(Number(it.quoted_price));
  return hasPart && hasQty && hasPrice;
}

function buildCustomerName(input: {
  first_name?: string | null;
  last_name?: string | null;
} | null | undefined): string | null {
  const first = String(input?.first_name ?? "").trim();
  const last = String(input?.last_name ?? "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  return full || null;
}

function buildVehicleLabel(input: {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
} | null | undefined): string | null {
  const year = String(input?.year ?? "").trim();
  const make = String(input?.make ?? "").trim();
  const model = String(input?.model ?? "").trim();
  const label = [year, make, model].filter(Boolean).join(" ").trim();
  return label || null;
}

export default function PartsRequestsPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "in_progress" | "ready" | "complete"
  >("all");

  const [buckets, setBuckets] = useState<WoBucket[]>([]);
  const [deletingWoId, setDeletingWoId] = useState<string | null>(null);

  const ACCENT_BORDER = "border-[color:var(--desktop-border-strong)]";
  const ACCENT_TEXT = "text-[var(--theme-text-primary,#E2E8F0)]";
  const ACCENT_HOVER_BG = "hover:bg-[color:color-mix(in_srgb,var(--brand-accent,#38bdf8)_12%,transparent)]";
  const ACCENT_FOCUS_RING = "focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-accent,#38bdf8)_35%,transparent)]";

  const PAGE = "w-full px-3 py-4 text-white sm:px-5 lg:px-8 xl:px-12";
  const CARD =
    "rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]";
  const CARD_PAD = `${CARD} p-3`;
  const INPUT = `w-full rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none ${ACCENT_FOCUS_RING}`;
  const SELECT = `w-full rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-white focus:outline-none ${ACCENT_FOCUS_RING}`;
  const BTN_BASE =
    "inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition disabled:opacity-60";
  const BTN_GHOST = `${BTN_BASE} border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_80%,black)]`;
  const BTN_ACCENT = `${BTN_BASE} ${ACCENT_BORDER} ${ACCENT_TEXT} bg-neutral-950/20 ${ACCENT_HOVER_BG}`;
  const BTN_DANGER = `${BTN_BASE} border-red-500/30 bg-red-950/25 text-red-200 hover:bg-red-950/40`;

  const PILL_BASE =
    "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold";
  const PILL_NEEDS = `${PILL_BASE} border-red-500/35 bg-red-950/35 text-red-200`;
  const PILL_QUOTED = `${PILL_BASE} border-teal-500/35 bg-teal-950/25 text-teal-200`;
  const PILL_APPROVED = `${PILL_BASE} border-sky-500/45 bg-sky-950/25 text-sky-100`;
  const PILL_FULFILLED = `${PILL_BASE} border-emerald-500/35 bg-emerald-950/25 text-emerald-200`;

  function pillFor(status: BucketStatus): string {
    if (status === "pending") return PILL_NEEDS;
    if (status === "in_progress") return PILL_APPROVED;
    if (status === "ready") return PILL_QUOTED;
    return PILL_FULFILLED;
  }

  function labelFor(status: BucketStatus): string {
    return requestFlowLabel(status);
  }


  const reload = async (): Promise<void> => {
    setLoading(true);

    const { data: reqs, error } = await supabase
      .from("part_requests")
      .select("*")
      .in("status", VISIBLE_STATUSES)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[parts/requests] load part_requests failed:", error);
      toast.error("Failed to load parts requests");
      setLoading(false);
      return;
    }

    const requestList = (reqs ?? []) as PartRequest[];

    const requestIds = requestList.map((r) => r.id);
    const itemsCountByRequest: Record<string, number> = {};
    const completeCountByRequest: Record<string, number> = {};
    const descByRequest: Record<string, string[]> = {};
    const itemStatesByRequest: Record<string, ReturnType<typeof toItemFlowDisplay>[]> = {};

    if (requestIds.length) {
      const { data: items, error: itemsErr } = await supabase
        .from("part_request_items")
        .select("request_id, description, part_id, qty, quoted_price, status, qty_approved, qty_received, qty_consumed")
        .in("request_id", requestIds);

      if (itemsErr) {
        console.error(
          "[parts/requests] load part_request_items failed:",
          itemsErr,
        );
      } else {
        (items ?? []).forEach((it) => {
          const row = it as Pick<
            PartRequestItem,
            "request_id" | "description" | "part_id" | "qty" | "quoted_price"
          >;

          itemsCountByRequest[row.request_id] =
            (itemsCountByRequest[row.request_id] ?? 0) + 1;

          if (isCompleteItem(row)) {
            completeCountByRequest[row.request_id] =
              (completeCountByRequest[row.request_id] ?? 0) + 1;
          }

          const d = (row.description ?? "").trim();
          if (d) (descByRequest[row.request_id] ||= []).push(d);

          (itemStatesByRequest[row.request_id] ||= []).push(
            toItemFlowDisplay({
              rawStatus: (row as { status?: string | null }).status ?? null,
              qty: row.qty,
              qtyApproved: (row as { qty_approved?: unknown }).qty_approved ?? row.qty,
              qtyReceived: (row as { qty_received?: unknown }).qty_received ?? 0,
              qtyAllocated: (row as { qty_consumed?: unknown }).qty_consumed ?? 0,
            }),
          );
        });
      }
    }

    const woIds = Array.from(
      new Set(
        requestList
          .map((r) => r.work_order_id)
          .filter((x): x is string => typeof x === "string" && x.length > 0),
      ),
    );

    const woById: Record<string, WorkOrderListRow> = {};

    if (woIds.length) {
      const { data: wos, error: woErr } = await supabase
        .from("work_orders")
        .select(`
          id,
          custom_id,
          customer_id,
          vehicle_id,
          customers (
            first_name,
            last_name
          ),
          vehicles (
            year,
            make,
            model
          )
        `)
        .in("id", woIds);

      if (woErr) {
        console.error("[parts/requests] load work_orders failed:", woErr);
      } else {
        (wos ?? []).forEach((w) => {
          const row = w as WorkOrderListRow;
          woById[row.id] = row;
        });
      }
    }

    const byWo: Record<string, WoBucket> = {};

    for (const r of requestList) {
      const workOrderId = r.work_order_id;
      if (!workOrderId) continue;

      const wo = woById[workOrderId];
      const customId = wo?.custom_id ?? null;

      const customerRecord = Array.isArray(wo?.customers)
        ? (wo.customers[0] ?? null)
        : (wo?.customers ?? null);

      const vehicleRecord = Array.isArray(wo?.vehicles)
        ? (wo.vehicles[0] ?? null)
        : (wo?.vehicles ?? null);

      const customerName = buildCustomerName(customerRecord);
      const vehicleLabel = buildVehicleLabel(vehicleRecord);

      if (!byWo[workOrderId]) {
        byWo[workOrderId] = {
          workOrderId,
          customId,
          customerName,
          vehicleLabel,
          status: "pending",
          requests: [],
          itemsCount: 0,
          completeCount: 0,
          completionPct: 0,
          latestAt: null,
          searchBlob: "",
        };
      }

      byWo[workOrderId].requests.push(r);

      const itemsCount = itemsCountByRequest[r.id] ?? 0;
      const completeCount = completeCountByRequest[r.id] ?? 0;

      byWo[workOrderId].itemsCount += itemsCount;
      byWo[workOrderId].completeCount += completeCount;

      const createdAt = r.created_at ? String(r.created_at) : null;
      if (createdAt) {
        if (!byWo[workOrderId].latestAt) {
          byWo[workOrderId].latestAt = createdAt;
        } else if (
          new Date(createdAt).getTime() >
          new Date(byWo[workOrderId].latestAt!).getTime()
        ) {
          byWo[workOrderId].latestAt = createdAt;
        }
      }
    }

    Object.values(byWo).forEach((b) => {
      const combined = b.requests.flatMap((r) => itemStatesByRequest[r.id] ?? []);
      b.status = toRequestFlowDisplay({
        rawStatus: b.requests[0]?.status ?? "requested",
        itemStates: combined,
      });

      const pct =
        b.itemsCount > 0
          ? Math.round((b.completeCount / b.itemsCount) * 100)
          : 0;
      b.completionPct = Math.max(0, Math.min(100, pct));

      const reqIdsBlob = b.requests.map((r) => r.id).join(" ");
      const descBlob = b.requests
        .flatMap((r) => descByRequest[r.id] ?? [])
        .join(" ");
      const woBlob = `${b.customId ?? ""} ${b.workOrderId}`;
      const customerBlob = b.customerName ?? "";
      const vehicleBlob = b.vehicleLabel ?? "";

      b.searchBlob =
        `${woBlob} ${customerBlob} ${vehicleBlob} ${reqIdsBlob} ${descBlob}`.toLowerCase();
    });

    const list = Object.values(byWo).sort((a, b) => {
      const ta = a.latestAt ? new Date(a.latestAt).getTime() : 0;
      const tb = b.latestAt ? new Date(b.latestAt).getTime() : 0;
      return tb - ta;
    });

    setBuckets(list);
    setLoading(false);
  };

  const deleteBucket = async (b: WoBucket): Promise<void> => {
    const woLabel =
      b.customId ||
      (looksLikeUuid(b.workOrderId)
        ? `#${b.workOrderId.slice(0, 8)}`
        : b.workOrderId);

    const requestIds = b.requests
      .map((r) => r.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    if (requestIds.length === 0) {
      toast.error("Nothing to delete for this work order");
      return;
    }

    const ok = window.confirm(
      `Delete ${requestIds.length} parts request${
        requestIds.length === 1 ? "" : "s"
      } for Work Order ${woLabel}?\n\nThis will delete the requests and their line items.`,
    );
    if (!ok) return;

    setDeletingWoId(b.workOrderId);
    const t = toast.loading("Deleting requests…");

    try {
      const { error: itemsErr } = await supabase
        .from("part_request_items")
        .delete()
        .in("request_id", requestIds);

      if (itemsErr) {
        console.error("[parts/requests] delete items failed:", itemsErr);
        toast.error("Failed to delete request items", { id: t });
        return;
      }

      const { error: reqErr } = await supabase
        .from("part_requests")
        .delete()
        .in("id", requestIds);

      if (reqErr) {
        console.error("[parts/requests] delete requests failed:", reqErr);
        toast.error("Failed to delete requests", { id: t });
        return;
      }

      toast.success("Deleted", { id: t });
      await reload();
    } catch (e) {
      console.error("[parts/requests] deleteBucket exception:", e);
      toast.error("Delete failed", { id: t });
    } finally {
      setDeletingWoId(null);
    }
  };

  useEffect(() => {
    void reload();

    const onRefresh = () => void reload();
    window.addEventListener("parts-request:submitted", onRefresh);
    window.addEventListener("parts:received", onRefresh);
    return () => {
      window.removeEventListener("parts-request:submitted", onRefresh);
      window.removeEventListener("parts:received", onRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    let list = buckets;

    if (statusFilter !== "all") {
      list = list.filter((b) => b.status === statusFilter);
    }

    if (!q) return list;
    return list.filter((b) => b.searchBlob.includes(q));
  }, [buckets, search, statusFilter]);

  return (
    <div className={PAGE}>
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">
            Parts
          </div>
          <h1
            className="text-2xl font-semibold text-white"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            Requests
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            One card per work order. Completion % is based on items with part + qty
            + price.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/parts" className={BTN_ACCENT}>
            Parts Dashboard
          </Link>
          <button
            type="button"
            className={BTN_GHOST}
            onClick={() => void reload()}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className={`${CARD_PAD} mb-4 space-y-3`}>
        <div className="grid gap-3 md:grid-cols-12 md:items-center">
          <div className="md:col-span-5">
            <div className="mb-1 text-xs text-neutral-400">
              Search (WO#, customer, vehicle, request id, part description)
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className={INPUT}
            />
          </div>

          <div className="md:col-span-4">
            <div className="mb-1 text-xs text-neutral-400">Status</div>
            <select
              className={SELECT}
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter((e.target.value as typeof statusFilter) ?? "all")
              }
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="ready">Ready</option>
              <option value="complete">Complete</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <div className="mb-1 text-xs text-neutral-400">Showing</div>
            <div className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-neutral-200">
              <span className="font-semibold text-white">{filtered.length}</span>{" "}
              work order{filtered.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={`${CARD_PAD} text-sm text-neutral-300`}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className={`${CARD_PAD} text-sm text-neutral-400`}>
          No active parts requests.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((b) => {
            const woLabel =
              b.customId ||
              (looksLikeUuid(b.workOrderId)
                ? `#${b.workOrderId.slice(0, 8)}`
                : b.workOrderId);

            const href = `/parts/requests/${encodeURIComponent(
              b.customId || b.workOrderId,
            )}`;

            const isDeleting = deletingWoId === b.workOrderId;

            return (
              <div key={b.workOrderId} className={CARD_PAD}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold tracking-wide text-white">
                      {woLabel}
                    </div>

                    {b.customerName && (
                      <div className="mt-1 text-sm font-medium text-neutral-200">
                        {b.customerName}
                      </div>
                    )}

                    {b.vehicleLabel && (
                      <div className="mt-1 text-xs text-neutral-500">
                        {b.vehicleLabel}
                      </div>
                    )}

                    <div className="mt-2 text-xs text-neutral-400">
                      {b.requests.length} request
                      {b.requests.length === 1 ? "" : "s"} · {b.itemsCount} item
                      {b.itemsCount === 1 ? "" : "s"}
                      {b.itemsCount > 0 ? (
                        <>
                          <span className="mx-2 text-neutral-600">·</span>
                          {b.completeCount}/{b.itemsCount} complete
                        </>
                      ) : null}
                    </div>
                  </div>

                  <span className={pillFor(b.status)}>{labelFor(b.status)}</span>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <span>Completion</span>
                    <span className={ACCENT_TEXT}>{b.completionPct}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden desktop-pill">
                    <div
                      className="h-full rounded-full bg-white/20"
                      style={{ width: `${b.completionPct}%` }}
                      aria-hidden="true"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={BTN_DANGER}
                    onClick={() => void deleteBucket(b)}
                    disabled={isDeleting}
                    title="Delete all requests under this work order"
                  >
                    {isDeleting ? "Deleting…" : "Delete"}
                  </button>

                  <Link href={href} className={BTN_ACCENT}>
                    Open requests →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
