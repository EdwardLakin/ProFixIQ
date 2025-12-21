// app/parts/requests/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Request = DB["public"]["Tables"]["part_requests"]["Row"];
type Item = DB["public"]["Tables"]["part_request_items"]["Row"];
type WorkOrder = Pick<
  DB["public"]["Tables"]["work_orders"]["Row"],
  "id" | "custom_id" | "status" | "created_at"
>;

type WoGroup = {
  wo: WorkOrder;
  requests: Array<Request & { items: Item[] }>;
  itemCount: number;
  needsQuote: boolean;
  newestRequestAt: number;
};

const VISIBLE_STATUSES: Request["status"][] = ["requested", "quoted", "approved"];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function requestNeedsQuote(status: Request["status"] | null | undefined): boolean {
  return (status ?? "requested").toLowerCase() !== "quoted";
}

function woChip(needsQuote: boolean): string {
  // red = needs quote, teal = quoted
  if (!needsQuote) {
    return "inline-flex items-center rounded-full border border-teal-500/40 bg-teal-900/20 px-3 py-1 text-xs font-medium text-teal-200";
  }
  return "inline-flex items-center rounded-full border border-red-500/40 bg-red-900/20 px-3 py-1 text-xs font-medium text-red-200";
}

export default function PartsRequestsPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [groups, setGroups] = useState<WoGroup[]>([]);
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  // theme (match WO page)
  const pageWrap =
    "w-full bg-background px-3 py-6 text-foreground sm:px-6 lg:px-10 xl:px-16";
  const card = "rounded-xl border border-white/18 bg-card/90 p-4 shadow-sm";
  const subCard = "rounded-lg border border-white/12 bg-muted/70";
  const input =
    "w-full rounded-md border border-white/12 bg-card/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-white/20";

  const reload = async (): Promise<void> => {
    setLoading(true);

    // 1) Load requests (active statuses)
    const { data: reqs, error } = await supabase
      .from("part_requests")
      .select("*")
      .in("status", VISIBLE_STATUSES)
      .order("created_at", { ascending: false });

    if (error) {
      // eslint-disable-next-line no-console
      console.error("load part_requests failed:", error.message);
      toast.error("Failed to load parts requests");
      setLoading(false);
      return;
    }

    const requestList: Request[] = (reqs ?? []) as Request[];
    const requestIds = requestList.map((r) => r.id);

    // 2) Load items for those requests
    const itemsMap: Record<string, Item[]> = {};
    if (requestIds.length) {
      const { data: items, error: itemsErr } = await supabase
        .from("part_request_items")
        .select("*")
        .in("request_id", requestIds);

      if (itemsErr) {
        // eslint-disable-next-line no-console
        console.error("load part_request_items failed:", itemsErr.message);
      }

      for (const it of (items ?? []) as Item[]) {
        (itemsMap[it.request_id] ||= []).push(it);
      }
    }

    // 3) Work orders for those requests
    const woIds = Array.from(
      new Set(
        requestList
          .map((r) => r.work_order_id)
          .filter((x): x is string => isNonEmptyString(x)),
      ),
    );

    const woMap: Record<string, WorkOrder> = {};
    if (woIds.length) {
      const { data: workOrders, error: woError } = await supabase
        .from("work_orders")
        .select("id, custom_id, status, created_at")
        .in("id", woIds);

      if (woError) {
        // eslint-disable-next-line no-console
        console.error("load work_orders failed:", woError.message);
      } else {
        for (const wo of (workOrders ?? []) as WorkOrder[]) {
          woMap[wo.id] = {
            id: wo.id,
            custom_id: wo.custom_id ?? null,
            status: wo.status ?? null,
            created_at: wo.created_at ?? null,
          };
        }
      }
    }

    // 4) Group by work order
    const tmp: Record<string, WoGroup> = {};

    for (const r of requestList) {
      const woId = r.work_order_id;
      if (!isNonEmptyString(woId)) continue;

      const wo = woMap[woId] ?? { id: woId, custom_id: null, status: null, created_at: null };

      const enriched: Request & { items: Item[] } = {
        ...r,
        items: itemsMap[r.id] ?? [],
      };

      if (!tmp[woId]) {
        tmp[woId] = {
          wo,
          requests: [],
          itemCount: 0,
          needsQuote: false,
          newestRequestAt: 0,
        };
      }

      tmp[woId].requests.push(enriched);
      tmp[woId].itemCount += enriched.items.length;
      tmp[woId].needsQuote = tmp[woId].needsQuote || requestNeedsQuote(r.status);
      tmp[woId].newestRequestAt = Math.max(
        tmp[woId].newestRequestAt,
        r.created_at ? new Date(r.created_at).getTime() : 0,
      );
    }

    const list = Object.values(tmp).sort((a, b) => b.newestRequestAt - a.newestRequestAt);
    setGroups(list);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;

    return groups.filter((g) => {
      const woLabel = (g.wo.custom_id || g.wo.id).toLowerCase();
      if (woLabel.includes(q)) return true;

      // also match request ids + item descriptions
      if (g.requests.some((r) => r.id.toLowerCase().includes(q))) return true;
      if (
        g.requests.some((r) =>
          (r.items ?? []).some((it) => (it.description ?? "").toLowerCase().includes(q)),
        )
      )
        return true;

      return false;
    });
  }, [groups, search]);

  return (
    <div className={pageWrap}>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Parts Requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One card per Work Order. <span className="text-red-200">Red</span> = needs quote ·{" "}
            <span className="text-teal-200">Teal</span> = quoted
          </p>
        </div>

        <Link
          href="/parts"
          className="inline-flex items-center rounded-md border border-white/18 bg-card/70 px-3 py-2 text-sm font-semibold hover:bg-card/90"
        >
          Parts Catalog
        </Link>
      </div>

      <div className={card}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-muted-foreground">
            Search by WO#, request id, or part description. Showing{" "}
            <span className="font-semibold text-foreground">{filtered.length}</span> work order
            {filtered.length === 1 ? "" : "s"}.
          </p>

          <div className="w-full md:w-96">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className={input}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className={`${card} mt-4`}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className={`${card} mt-4 text-sm text-muted-foreground`}>
          No active parts requests.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((g) => {
            const woDisplay = g.wo.custom_id || `#${g.wo.id.slice(0, 8)}`;

            // ✅ choose where the card goes:
            // Option A (recommended): go straight to the work order page (custom id friendly)
            const workOrderHref = `/work-orders/${encodeURIComponent(g.wo.custom_id || g.wo.id)}`;

            // Option B (if you later upgrade /parts/requests/[id] to be a WO view)
            // const workOrderHref = `/parts/requests/${encodeURIComponent(g.wo.custom_id || g.wo.id)}`;

            return (
              <div key={g.wo.id} className={card}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold text-foreground">
                      {woDisplay}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {g.requests.length} request{g.requests.length === 1 ? "" : "s"} ·{" "}
                      {g.itemCount} item{g.itemCount === 1 ? "" : "s"}
                    </div>
                  </div>

                  <span className={woChip(g.needsQuote)}>
                    {g.needsQuote ? "Needs quote" : "Quoted"}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {g.requests.slice(0, 2).map((r) => {
                    const need = requestNeedsQuote(r.status);
                    return (
                      <div key={r.id} className={`${subCard} p-3`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">
                            Req #{r.id.slice(0, 8)}
                          </div>
                          <span className={woChip(need)}>
                            {need ? "Needs quote" : "Quoted"}
                          </span>
                        </div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/90">
                          {(r.items ?? []).slice(0, 3).map((it) => (
                            <li key={it.id}>{it.description || "Part"}</li>
                          ))}
                          {(r.items ?? []).length > 3 && (
                            <li className="text-muted-foreground">
                              + {(r.items ?? []).length - 3} more…
                            </li>
                          )}
                        </ul>
                      </div>
                    );
                  })}
                  {g.requests.length > 2 && (
                    <div className="text-xs text-muted-foreground">
                      + {g.requests.length - 2} more requests…
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Link
                    href={workOrderHref}
                    className="inline-flex items-center rounded-md border border-white/18 bg-card/70 px-3 py-2 text-xs font-semibold hover:bg-card/90"
                    title="Open the work order"
                  >
                    Open work order →
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