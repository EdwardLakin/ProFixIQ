"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Request = DB["public"]["Tables"]["part_requests"]["Row"];
type Item = DB["public"]["Tables"]["part_request_items"]["Row"];
type WorkOrderMeta = {
  id: string;
  custom_id: string | null;
};

const ALL_STATUSES: Request["status"][] = [
  "requested",
  "quoted",
  "approved",
  "fulfilled",
  "rejected",
  "cancelled",
];

// Status columns we actually want to show on THIS page
const VISIBLE_STATUSES: Request["status"][] = [
  "requested",
  "quoted",
  "approved",
];

function makeEmptyBuckets(): Record<
  Request["status"],
  (Request & { items: Item[] })[]
> {
  return {
    requested: [],
    quoted: [],
    approved: [],
    fulfilled: [],
    rejected: [],
    cancelled: [],
  };
}

export default function PartsRequestsPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [byStatus, setByStatus] = useState<
    Record<Request["status"], (Request & { items: Item[] })[]>
  >(makeEmptyBuckets());

  const [workOrdersById, setWorkOrdersById] = useState<
    Record<string, WorkOrderMeta>
  >({});

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);

      // 1) fetch all requests
      const { data: reqs, error } = await supabase
        .from("part_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("load part_requests failed:", error.message);
        toast.error("Failed to load parts requests");
        setLoading(false);
        return;
      }

      const requestList = (reqs ?? []) as Request[];
      const requestIds = requestList.map((r) => r.id);

      // 2) fetch all items for these requests
      const itemsMap: Record<string, Item[]> = {};
      if (requestIds.length) {
        const { data: items } = await supabase
          .from("part_request_items")
          .select("*")
          .in("request_id", requestIds);

        for (const it of items ?? []) {
          (itemsMap[it.request_id] ||= []).push(it);
        }
      }

      // 3) fetch work order metadata for display (TU000001 instead of UUID)
      const woIds = Array.from(
        new Set(
          requestList
            .map((r) => r.work_order_id)
            .filter((id): id is string => typeof id === "string" && !!id),
        ),
      );

      const woMap: Record<string, WorkOrderMeta> = {};
      if (woIds.length) {
        const { data: workOrders, error: woError } = await supabase
          .from("work_orders")
          .select("id, custom_id")
          .in("id", woIds);

        if (woError) {
          console.error(
            "load work_orders for parts requests failed:",
            woError.message,
          );
        } else {
          for (const wo of workOrders ?? []) {
            woMap[wo.id] = {
              id: wo.id,
              custom_id: wo.custom_id ?? null,
            };
          }
        }
      }
      setWorkOrdersById(woMap);

      // 4) group by status
      const grouped = makeEmptyBuckets();

      for (const r of requestList) {
        const status = (r.status ?? "requested") as Request["status"];
        const bucket = grouped[status] ?? grouped.requested;
        bucket.push({ ...r, items: itemsMap[r.id] ?? [] });
      }

      setByStatus(grouped);
      setLoading(false);
    })();
  }, [supabase]);

  // Derived: apply search filter client-side
  const filteredByStatus = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byStatus;

    const filtered = makeEmptyBuckets();

    (ALL_STATUSES as Request["status"][]).forEach((status) => {
      const list = byStatus[status] ?? [];
      filtered[status] = list.filter((r) => {
        const woMeta = r.work_order_id
          ? workOrdersById[r.work_order_id]
          : undefined;

        // label used both for display and search
        const woLabel =
          woMeta?.custom_id ||
          woMeta?.id ||
          r.work_order_id || // fall back to raw FK if meta missing
          "";

        const inWorkOrder = woLabel.toLowerCase().includes(q);
        const inRequestId = r.id.toLowerCase().includes(q);
        const inItems = (r.items ?? []).some((it) =>
          (it.description ?? "").toLowerCase().includes(q),
        );

        return inWorkOrder || inRequestId || inItems;
      });
    });

    return filtered;
  }, [search, byStatus, workOrdersById]);

  const handleDelete = async (requestId: string) => {
    const confirmed = window.confirm(
      "Delete this parts request? This will also remove its items.",
    );
    if (!confirmed) return;

    // delete items first (in case cascade is not configured)
    const { error: itemsError } = await supabase
      .from("part_request_items")
      .delete()
      .eq("request_id", requestId);

    if (itemsError) {
      console.error(
        "delete part_request_items failed:",
        itemsError.message,
      );
      toast.error("Unable to delete request items.");
      return;
    }

    const { error } = await supabase
      .from("part_requests")
      .delete()
      .eq("id", requestId);

    if (error) {
      console.error("delete part_requests failed:", error.message);
      toast.error("Unable to delete parts request.");
      return;
    }

    // update local state
    setByStatus((prev) => {
      const next = makeEmptyBuckets();
      (ALL_STATUSES as Request["status"][]).forEach((status) => {
        next[status] = (prev[status] ?? []).filter(
          (r) => r.id !== requestId,
        );
      });
      return next;
    });

    toast.success("Parts request deleted.");
  };

  const totalVisibleCount = VISIBLE_STATUSES.reduce(
    (sum, status) => sum + (filteredByStatus[status]?.length ?? 0),
    0,
  );

  return (
    <div className="space-y-4 p-6 text-white">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Parts Requests</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Active requests that still need quoting or approval. Completed
            requests move off this list.
          </p>
        </div>
        <Link
          href="/parts"
          className="inline-flex items-center rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
        >
          Parts Catalog
        </Link>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-xs text-neutral-500">
          Search by WO#, request id, or line description. Showing{" "}
          <span className="font-semibold text-neutral-200">
            {totalVisibleCount}
          </span>{" "}
          active request{totalVisibleCount === 1 ? "" : "s"}.
        </p>
        <div className="w-full md:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search requests…"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-neutral-400">
          Loading…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {VISIBLE_STATUSES.map((status) => {
            const list = filteredByStatus[status] ?? [];
            return (
              <div
                key={status}
                className="flex flex-col rounded border border-neutral-800 bg-neutral-900"
              >
                <div className="border-b border-neutral-800 px-3 py-2 text-sm capitalize text-neutral-300">
                  {status}
                </div>
                <div className="flex-1 space-y-3 p-3">
                  {list.length === 0 ? (
                    <div className="text-sm text-neutral-500">
                      No requests
                    </div>
                  ) : (
                    list.map((r) => {
                      const woMeta = r.work_order_id
                        ? workOrdersById[r.work_order_id]
                        : undefined;

                      // Prefer TU000001-style custom id; otherwise fall back
                      // to whatever FK we have, shortened.
                      const woDisplayId =
                        woMeta?.custom_id ||
                        (woMeta?.id ??
                          r.work_order_id ??
                          "")
                          .toString()
                          .slice(0, 8) || null;

                      return (
                        <div
                          key={r.id}
                          className="rounded border border-neutral-800 bg-neutral-950"
                        >
                          <Link
                            href={`/parts/requests/${r.id}`}
                            className="block p-3 hover:border-orange-500"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold">
                                  WO: {woDisplayId ?? "—"}
                                </div>
                                <div className="text-xs text-neutral-400">
                                  {r.created_at
                                    ? new Date(
                                        r.created_at,
                                      ).toLocaleString()
                                    : "—"}
                                </div>
                              </div>
                            </div>

                            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                              {(r.items ?? []).slice(0, 4).map((it) => (
                                <li key={it.id}>
                                  {it.description} × {Number(it.qty)}
                                </li>
                              ))}
                              {(r.items ?? []).length > 4 && (
                                <li>
                                  + {(r.items ?? []).length - 4} more…
                                </li>
                              )}
                            </ul>
                          </Link>

                          <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => void handleDelete(r.id)}
                              className="text-xs font-medium text-red-300 hover:text-red-200"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}