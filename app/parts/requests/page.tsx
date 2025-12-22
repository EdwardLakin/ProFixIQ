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

type WoBucket = {
  workOrderId: string;
  customId: string | null;
  status: "needs_quote" | "quoted";
  requests: PartRequest[];
  itemsCount: number;
  latestAt: string | null;
  searchBlob: string; // request ids + item descriptions for search
};

const VISIBLE_STATUSES: PartRequest["status"][] = ["requested", "quoted", "approved"];

const CARD =
  "rounded-xl border border-white/10 bg-card/85 p-4 shadow-sm";
const INPUT =
  "w-full rounded-lg border border-white/10 bg-muted/60 px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-white/10";
const BTN =
  "inline-flex items-center justify-center rounded-lg border border-white/10 bg-card/85 px-4 py-2 text-sm font-medium text-foreground hover:bg-card/95";

const PILL_BASE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold";
const PILL_NEEDS = `${PILL_BASE} border-red-500/35 bg-red-500/10 text-red-200`;
const PILL_QUOTED = `${PILL_BASE} border-teal-500/35 bg-teal-500/10 text-teal-200`;

function looksLikeUuid(s: string): boolean {
  return s.includes("-") && s.length >= 36;
}

export default function PartsRequestsPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [buckets, setBuckets] = useState<WoBucket[]>([]);

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

    // 2) load request items (for counts + search by part description)
    const requestIds = requestList.map((r) => r.id);
    const itemsCountByRequest: Record<string, number> = {};
    const descByRequest: Record<string, string[]> = {};

    if (requestIds.length) {
      const { data: items, error: itemsErr } = await supabase
        .from("part_request_items")
        .select("request_id, description")
        .in("request_id", requestIds);

      if (itemsErr) {
        // eslint-disable-next-line no-console
        console.error("[parts/requests] load part_request_items failed:", itemsErr);
      } else {
        (items ?? []).forEach((it) => {
          const row = it as Pick<PartRequestItem, "request_id" | "description">;
          itemsCountByRequest[row.request_id] = (itemsCountByRequest[row.request_id] ?? 0) + 1;

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
          latestAt: null,
          searchBlob: "",
        };
      }

      byWo[workOrderId].requests.push(r);
      byWo[workOrderId].itemsCount += itemsCountByRequest[r.id] ?? 0;

      const createdAt = r.created_at ? String(r.created_at) : null;
      if (createdAt) {
        if (!byWo[workOrderId].latestAt) byWo[workOrderId].latestAt = createdAt;
        else if (new Date(createdAt).getTime() > new Date(byWo[workOrderId].latestAt!).getTime()) {
          byWo[workOrderId].latestAt = createdAt;
        }
      }
    }

    // status: needs_quote if ANY request is requested
    Object.values(byWo).forEach((b) => {
      const hasRequested = b.requests.some((r) => (r.status ?? "requested") === "requested");
      b.status = hasRequested ? "needs_quote" : "quoted";

      const reqIdsBlob = b.requests.map((r) => r.id).join(" ");
      const descBlob = b.requests
        .flatMap((r) => descByRequest[r.id] ?? [])
        .join(" ");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return buckets;
    return buckets.filter((b) => b.searchBlob.includes(q));
  }, [buckets, search]);

  return (
    <div className="w-full bg-background px-3 py-6 text-foreground sm:px-6 lg:px-10 xl:px-16">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Parts Requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One card per Work Order. <span className="text-red-200">Red</span> = needs quote ·{" "}
            <span className="text-teal-200">Teal</span> = quoted
          </p>
        </div>

        <Link href="/parts" className={BTN}>
          Parts Catalog
        </Link>
      </div>

      <div className={`${CARD} mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between`}>
        <div className="text-xs text-muted-foreground">
          Search by WO#, request id, or part description. Showing{" "}
          <span className="font-semibold text-foreground">{filtered.length}</span>{" "}
          work order{filtered.length === 1 ? "" : "s"}.
        </div>

        <div className="w-full md:w-96">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className={INPUT}
          />
        </div>
      </div>

      {loading ? (
        <div className={`${CARD} text-sm text-muted-foreground`}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className={`${CARD} text-sm text-muted-foreground`}>No active parts requests.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((b) => {
            const woLabel =
              b.customId ||
              (looksLikeUuid(b.workOrderId) ? `#${b.workOrderId.slice(0, 8)}` : b.workOrderId);

            // link to the parts requests WO page (not the WO page)
            const href = `/parts/requests/${encodeURIComponent(b.customId || b.workOrderId)}`;

            return (
              <div key={b.workOrderId} className={CARD}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold tracking-wide text-foreground">
                      {woLabel}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {b.requests.length} request{b.requests.length === 1 ? "" : "s"} ·{" "}
                      {b.itemsCount} item{b.itemsCount === 1 ? "" : "s"}
                    </div>
                  </div>

                  <span className={b.status === "needs_quote" ? PILL_NEEDS : PILL_QUOTED}>
                    {b.status === "needs_quote" ? "Needs quote" : "Quoted"}
                  </span>
                </div>

                <div className="mt-4 flex justify-end">
                  <Link href={href} className={BTN}>
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