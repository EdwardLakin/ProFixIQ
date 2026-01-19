// app/parts/requests/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type PartRequest = DB["public"]["Tables"]["part_requests"]["Row"];
type PartRequestItem = DB["public"]["Tables"]["part_request_items"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];

type BucketStatus =
  | "needs_quote"
  | "quoted"
  | "approved"
  | "fulfilled"
  | "mixed";

type WoBucket = {
  workOrderId: string;
  customId: string | null;
  status: BucketStatus;
  requests: PartRequest[];
  itemsCount: number;
  completeCount: number; // items complete (part+qty+price)
  completionPct: number; // 0..100
  latestAt: string | null;
  searchBlob: string; // request ids + item descriptions for search
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

function isCompleteItem(it: Pick<PartRequestItem, "part_id" | "qty" | "quoted_price" | "description">): boolean {
  const hasPart = typeof it.part_id === "string" && it.part_id.length > 0;
  const qty = toNum(it.qty);
  const hasQty = qty > 0;
  const hasPrice = it.quoted_price != null && Number.isFinite(Number(it.quoted_price));
  // description is helpful, but not required for “complete”
  return hasPart && hasQty && hasPrice;
}

export default function PartsRequestsPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "needs_quote" | "quoted" | "approved" | "fulfilled"
  >("all");

  const [buckets, setBuckets] = useState<WoBucket[]>([]);

  // ---- Theme (glass + burnt copper / metallic; no orange-400/500) ----
  const COPPER_BORDER = "border-[#8b5a2b]/60";
  const COPPER_TEXT = "text-[#c88a4d]";
  const COPPER_HOVER_BG = "hover:bg-[#8b5a2b]/10";
  const COPPER_FOCUS_RING = "focus:ring-2 focus:ring-[#8b5a2b]/35";

  const PAGE = "w-full px-3 py-6 text-white sm:px-6 lg:px-10 xl:px-16";
  const CARD =
    "rounded-xl border border-white/10 bg-neutral-950/35 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]";
  const CARD_PAD = `${CARD} p-4`;
  const INPUT = `w-full rounded-lg border border-white/10 bg-neutral-950/40 px-4 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none ${COPPER_FOCUS_RING}`;
  const SELECT = `w-full rounded-lg border border-white/10 bg-neutral-950/40 px-3 py-2 text-sm text-white focus:outline-none ${COPPER_FOCUS_RING}`;
  const BTN_BASE =
    "inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition disabled:opacity-60";
  const BTN_GHOST = `${BTN_BASE} border-white/10 bg-neutral-950/20 hover:bg-white/5`;
  const BTN_COPPER = `${BTN_BASE} ${COPPER_BORDER} ${COPPER_TEXT} bg-neutral-950/20 ${COPPER_HOVER_BG}`;

  const PILL_BASE =
    "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold";
  const PILL_NEEDS = `${PILL_BASE} border-red-500/35 bg-red-950/35 text-red-200`;
  const PILL_QUOTED = `${PILL_BASE} border-teal-500/35 bg-teal-950/25 text-teal-200`;
  const PILL_APPROVED = `${PILL_BASE} border-sky-500/35 bg-sky-950/25 text-sky-200`;
  const PILL_FULFILLED = `${PILL_BASE} border-emerald-500/35 bg-emerald-950/25 text-emerald-200`;
  const PILL_MIXED = `${PILL_BASE} ${COPPER_BORDER} bg-neutral-950/20 ${COPPER_TEXT}`;

  function pillFor(status: BucketStatus): string {
    if (status === "needs_quote") return PILL_NEEDS;
    if (status === "quoted") return PILL_QUOTED;
    if (status === "approved") return PILL_APPROVED;
    if (status === "fulfilled") return PILL_FULFILLED;
    return PILL_MIXED;
  }

  function labelFor(status: BucketStatus): string {
    if (status === "needs_quote") return "Needs quote";
    if (status === "quoted") return "Quoted";
    if (status === "approved") return "Approved";
    if (status === "fulfilled") return "Fulfilled";
    return "Mixed";
  }

  function computeBucketStatus(reqs: PartRequest[]): BucketStatus {
    const statuses = reqs.map((r) => String(r.status ?? "requested").toLowerCase());
    const uniq = Array.from(new Set(statuses));

    const hasRequested = uniq.includes("requested");
    const hasQuoted = uniq.includes("quoted");
    const hasApproved = uniq.includes("approved");
    const hasFulfilled = uniq.includes("fulfilled");

    // priority: requested -> needs_quote
    if (hasRequested) return "needs_quote";

    // if all fulfilled
    if (hasFulfilled && !hasApproved && !hasQuoted) return "fulfilled";
    if (hasFulfilled && hasApproved && !hasQuoted) return "mixed";
    if (hasFulfilled && hasQuoted) return "mixed";

    // if all approved (or mixture of approved+fulfilled will have returned mixed above)
    if (hasApproved && !hasQuoted) return "approved";

    // quoted-only
    if (hasQuoted && !hasApproved && !hasFulfilled) return "quoted";

    // fallback
    if (uniq.length === 1) {
      const only = uniq[0];
      if (only === "fulfilled") return "fulfilled";
      if (only === "approved") return "approved";
      if (only === "quoted") return "quoted";
      return "needs_quote";
    }

    return "mixed";
  }

  const reload = async (): Promise<void> => {
    setLoading(true);

    // 1) load active-ish part_requests
    const { data: reqs, error } = await supabase
      .from("part_requests")
      .select("*")
      .in("status", VISIBLE_STATUSES)
      .order("created_at", { ascending: false });

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[parts/requests] load part_requests failed:", error);
      toast.error("Failed to load parts requests");
      setLoading(false);
      return;
    }

    const requestList = (reqs ?? []) as PartRequest[];

    // 2) load request items (counts + completion + search by description)
    const requestIds = requestList.map((r) => r.id);
    const itemsCountByRequest: Record<string, number> = {};
    const completeCountByRequest: Record<string, number> = {};
    const descByRequest: Record<string, string[]> = {};

    if (requestIds.length) {
      const { data: items, error: itemsErr } = await supabase
        .from("part_request_items")
        .select("request_id, description, part_id, qty, quoted_price")
        .in("request_id", requestIds);

      if (itemsErr) {
        // eslint-disable-next-line no-console
        console.error("[parts/requests] load part_request_items failed:", itemsErr);
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
        });
      }
    }

    // 3) load work_orders for custom_id
    const woIds = Array.from(
      new Set(
        requestList
          .map((r) => r.work_order_id)
          .filter((x): x is string => typeof x === "string" && x.length > 0),
      ),
    );

    const woById: Record<string, WorkOrder> = {};
    if (woIds.length) {
      const { data: wos, error: woErr } = await supabase
        .from("work_orders")
        .select("id, custom_id")
        .in("id", woIds);

      if (woErr) {
        // eslint-disable-next-line no-console
        console.error("[parts/requests] load work_orders failed:", woErr);
      } else {
        (wos ?? []).forEach((w) => {
          const row = w as WorkOrder;
          woById[row.id] = row;
        });
      }
    }

    // 4) group into 1 card per work order
    const byWo: Record<string, WoBucket> = {};

    for (const r of requestList) {
      const workOrderId = r.work_order_id;
      if (!workOrderId) continue;

      const wo = woById[workOrderId];
      const customId = wo?.custom_id ?? null;

      if (!byWo[workOrderId]) {
        byWo[workOrderId] = {
          workOrderId,
          customId,
          status: "needs_quote",
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
        if (!byWo[workOrderId].latestAt) byWo[workOrderId].latestAt = createdAt;
        else if (new Date(createdAt).getTime() > new Date(byWo[workOrderId].latestAt!).getTime()) {
          byWo[workOrderId].latestAt = createdAt;
        }
      }
    }

    // 5) compute bucket status + search blob + completion %
    Object.values(byWo).forEach((b) => {
      b.status = computeBucketStatus(b.requests);

      const pct =
        b.itemsCount > 0 ? Math.round((b.completeCount / b.itemsCount) * 100) : 0;
      b.completionPct = Math.max(0, Math.min(100, pct));

      const reqIdsBlob = b.requests.map((r) => r.id).join(" ");
      const descBlob = b.requests.flatMap((r) => descByRequest[r.id] ?? []).join(" ");
      const woBlob = `${b.customId ?? ""} ${b.workOrderId}`;
      b.searchBlob = `${woBlob} ${reqIdsBlob} ${descBlob}`.toLowerCase();
    });

    const list = Object.values(byWo).sort((a, b) => {
      const ta = a.latestAt ? new Date(a.latestAt).getTime() : 0;
      const tb = b.latestAt ? new Date(b.latestAt).getTime() : 0;
      return tb - ta;
    });

    setBuckets(list);
    setLoading(false);
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
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
            One card per Work Order. Completion % is based on items with part + qty + price.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/parts" className={BTN_COPPER}>
            Parts Dashboard
          </Link>
          <button type="button" className={BTN_GHOST} onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </div>

      <div className={`${CARD_PAD} mb-4 space-y-3`}>
        <div className="grid gap-3 md:grid-cols-12 md:items-center">
          <div className="md:col-span-5">
            <div className="text-xs text-neutral-400 mb-1">
              Search (WO#, request id, part description)
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className={INPUT}
            />
          </div>

          <div className="md:col-span-4">
            <div className="text-xs text-neutral-400 mb-1">Status</div>
            <select
              className={SELECT}
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  (e.target.value as typeof statusFilter) ?? "all",
                )
              }
            >
              <option value="all">All</option>
              <option value="needs_quote">Needs quote</option>
              <option value="quoted">Quoted</option>
              <option value="approved">Approved</option>
              <option value="fulfilled">Fulfilled</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <div className="text-xs text-neutral-400 mb-1">Showing</div>
            <div className="rounded-lg border border-white/10 bg-neutral-950/20 px-3 py-2 text-sm text-neutral-200">
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
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((b) => {
            const woLabel =
              b.customId ||
              (looksLikeUuid(b.workOrderId)
                ? `#${b.workOrderId.slice(0, 8)}`
                : b.workOrderId);

            // ✅ IMPORTANT:
            // This page links to /parts/requests/[id] where [id] resolves a WORK ORDER
            // by custom_id or uuid. So we pass customId if available, else wo id.
            const href = `/parts/requests/${encodeURIComponent(
              b.customId || b.workOrderId,
            )}`;

            return (
              <div key={b.workOrderId} className={`${CARD_PAD}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold tracking-wide text-white">
                      {woLabel}
                    </div>
                    <div className="mt-1 text-xs text-neutral-400">
                      {b.requests.length} request{b.requests.length === 1 ? "" : "s"} ·{" "}
                      {b.itemsCount} item{b.itemsCount === 1 ? "" : "s"}
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

                {/* completion bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <span>Completion</span>
                    <span className={COPPER_TEXT}>{b.completionPct}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full border border-white/10 bg-black/40">
                    <div
                      className="h-full rounded-full bg-white/20"
                      style={{ width: `${b.completionPct}%` }}
                      aria-hidden="true"
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Link href={href} className={BTN_COPPER}>
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