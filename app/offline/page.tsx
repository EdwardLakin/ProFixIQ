"use client";

import { useEffect, useState } from "react";
import {
  getOfflineMutationScope,
  getOfflineSyncSummary,
  subscribeOfflineMutations,
} from "@/features/shared/lib/offline/mutations";
import { listOfflineSnapshots } from "@/features/shared/lib/offline/database";
import { replayAllOfflineMutations } from "@/features/shared/lib/offline/replay";

type WorkOrderSummary = {
  id?: string;
  work_order_number?: string | number | null;
  status?: string | null;
  customers?: { first_name?: string | null; last_name?: string | null } | null;
  vehicles?: { year?: string | number | null; make?: string | null; model?: string | null } | null;
};
type WorkOrderListSnapshot = { rows: WorkOrderSummary[] };
type WorkOrderDetailSnapshot = {
  workOrder: WorkOrderSummary & { custom_id?: string | null };
  customer?: { first_name?: string | null; last_name?: string | null } | null;
  vehicle?: { year?: string | number | null; make?: string | null; model?: string | null } | null;
  lines: Array<{ id?: string; description?: string | null; status?: string | null }>;
};

export default function OfflinePage() {
  const [online, setOnline] = useState(() => typeof navigator !== "undefined" && navigator.onLine);
  const [summary, setSummary] = useState(() => getOfflineSyncSummary());
  const [orders, setOrders] = useState<WorkOrderSummary[]>([]);
  const [details, setDetails] = useState<WorkOrderDetailSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pending = summary.queued + summary.syncing + summary.failed;
  const selected = details.find((detail) => detail.workOrder.id === selectedId) ?? null;

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine);
      setSummary(getOfflineSyncSummary());
    };
    const unsubscribe = subscribeOfflineMutations(refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    const scope = getOfflineMutationScope();
    if (scope) {
      void Promise.all([
        listOfflineSnapshots<WorkOrderListSnapshot>({
          scope,
          kind: "mobile-work-order-list",
        }),
        listOfflineSnapshots<WorkOrderDetailSnapshot>({
          scope,
          kind: "mobile-work-order-detail",
        }),
      ]).then(([listRows, detailRows]) => {
        setOrders(listRows.flatMap((row) => row.data.rows).filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index));
        setDetails(detailRows.map((row) => row.data).filter((detail, index, all) => all.findIndex((item) => item.workOrder.id === detail.workOrder.id) === index));
      });
    }
    return () => {
      unsubscribe();
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  const reconnect = async () => {
    if (!navigator.onLine) return;
    await replayAllOfflineMutations();
    window.location.assign("/");
  };

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
      <div className="mx-auto max-w-2xl space-y-6">
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">ProFixIQ offline</p>
          <h1 className="mt-2 text-2xl font-semibold">Your saved work is still available.</h1>
          <p className="mt-3 text-sm text-slate-300">
            {online ? "Connection restored. Sync your queued updates now." : "Updates are stored on this device and will sync after reconnecting."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-slate-800 px-3 py-1">{pending} pending</span>
            <span className="rounded-full bg-slate-800 px-3 py-1">{summary.failed} need retry</span>
            <span className="rounded-full bg-slate-800 px-3 py-1">{summary.conflicted} conflicts</span>
          </div>
          <button
            type="button"
            onClick={() => void reconnect()}
            disabled={!online}
            className="mt-6 rounded-xl bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reconnect and sync
          </button>
        </section>

        {orders.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">Recently saved work orders</h2>
            {orders.map((order, index) => (
              <article key={order.id ?? index} className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <p className="font-semibold">Work order {order.work_order_number ?? "—"}</p>
                <p className="mt-1 text-sm text-slate-300">
                  {[order.customers?.first_name, order.customers?.last_name].filter(Boolean).join(" ") || "Customer"}
                  {" · "}
                  {[order.vehicles?.year, order.vehicles?.make, order.vehicles?.model].filter(Boolean).join(" ") || "Vehicle"}
                </p>
                <p className="mt-2 text-xs uppercase tracking-wider text-sky-300">{order.status ?? "active"}</p>
                {details.some((detail) => detail.workOrder.id === order.id) && (
                  <button type="button" onClick={() => setSelectedId(order.id ?? null)} className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-sky-200">
                    View saved details
                  </button>
                )}
              </article>
            ))}
          </section>
        )}

        {selected && (
          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-sky-300">Saved work order</p>
                <h2 className="mt-1 text-xl font-semibold">{selected.workOrder.custom_id ?? selected.workOrder.work_order_number ?? "Details"}</h2>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="text-sm text-slate-300">Close</button>
            </div>
            <p className="mt-2 text-sm text-slate-300">
              {[selected.customer?.first_name, selected.customer?.last_name].filter(Boolean).join(" ") || "Customer"}
              {" · "}
              {[selected.vehicle?.year, selected.vehicle?.make, selected.vehicle?.model].filter(Boolean).join(" ") || "Vehicle"}
            </p>
            <div className="mt-5 space-y-2">
              {selected.lines.map((line, index) => (
                <div key={line.id ?? index} className="rounded-xl bg-slate-950/70 p-3">
                  <p className="text-sm font-medium">{line.description ?? "Job line"}</p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">{line.status ?? "awaiting"}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
