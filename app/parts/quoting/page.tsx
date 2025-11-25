"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { format } from "date-fns";
import dynamic from "next/dynamic";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import VoiceContextSetter from "@/features/shared/voice/VoiceContextSetter";
import VoiceButton from "@/features/shared/voice/VoiceButton";
import { requestQuoteSuggestion } from "@inspections/lib/inspection/aiQuote";

const PartsDrawer = dynamic(
  () => import("@/features/parts/components/PartsDrawer"),
  {
    ssr: false,
  }
);

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type QueueRow = WorkOrderLine & {
  work_order: WorkOrder | null;
  vehicle: Vehicle | null;
  customer: Customer | null;
};

type MenuUpsertResponse = {
  ok: boolean;
  menuItemId?: string;
  updated?: boolean;
  error?: string;
  detail?: string;
};

const BASE_BADGE =
  "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium";
const BADGE: Record<string, string> = {
  awaiting: "bg-sky-900/20 border-sky-500/40 text-sky-300",
  awaiting_approval: "bg-blue-900/20 border-blue-500/40 text-blue-300",
  queued: "bg-indigo-900/20 border-indigo-500/40 text-indigo-300",
  in_progress: "bg-orange-900/20 border-orange-500/40 text-orange-300",
  on_hold: "bg-amber-900/20 border-amber-500/40 text-amber-300",
  completed: "bg-green-900/20 border-green-500/40 text-green-300",
};
const chip = (s: string | null | undefined): string => {
  const k = (s ?? "awaiting").toLowerCase().replaceAll(" ", "_");
  return `${BASE_BADGE} ${BADGE[k] ?? BADGE.awaiting}`;
};

export default function QuotingQueuePage(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId]
  );

  const [bulkQueue, setBulkQueue] = useState<string[]>([]);
  const bulkActive = bulkQueue.length > 0;

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: lines, error: lerr } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("approval_state", "pending")
        .order("created_at", { ascending: true });

      if (lerr) throw lerr;

      const wol = (lines ?? []) as WorkOrderLine[];
      if (wol.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const woIds = [
        ...new Set(
          wol.map((l) => l.work_order_id).filter(Boolean) as string[]
        ),
      ];
      const { data: woRows } = await supabase
        .from("work_orders")
        .select("*")
        .in("id", woIds);

      const woById = new Map<string, WorkOrder>();
      (woRows ?? []).forEach((w) => woById.set(w.id, w as WorkOrder));

      const vehIds = [
        ...new Set(
          (woRows ?? [])
            .map((w) => (w as WorkOrder).vehicle_id)
            .filter(Boolean) as string[]
        ),
      ];
      const custIds = [
        ...new Set(
          (woRows ?? [])
            .map((w) => (w as WorkOrder).customer_id)
            .filter(Boolean) as string[]
        ),
      ];

      const [vehRes, custRes] = await Promise.all([
        vehIds.length
          ? supabase.from("vehicles").select("*").in("id", vehIds)
          : Promise.resolve({ data: [] } as const),
        custIds.length
          ? supabase.from("customers").select("*").in("id", custIds)
          : Promise.resolve({ data: [] } as const),
      ]);

      const vById = new Map<string, Vehicle>();
      (vehRes.data ?? []).forEach((v) =>
        vById.set((v as Vehicle).id, v as Vehicle)
      );

      const cById = new Map<string, Customer>();
      (custRes.data ?? []).forEach((c) =>
        cById.set((c as Customer).id, c as Customer)
      );

      const out: QueueRow[] = wol.map((l) => {
        const wo = l.work_order_id
          ? woById.get(l.work_order_id) ?? null
          : null;
        const vehicle = wo?.vehicle_id
          ? vById.get(wo.vehicle_id) ?? null
          : null;
        const customer = wo?.customer_id
          ? cById.get(wo.customer_id) ?? null
          : null;
        return { ...l, work_order: wo, vehicle, customer };
      });

      setRows(out);
    } catch (e) {
      const msg =
        (e as { message?: string })?.message ??
        "Failed to load quoting queue.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    const ch = supabase
      .channel("quote-queue")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_lines",
          filter: "approval_state=eq.pending",
        },
        () => void fetchQueue()
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        // ignore
      }
    };
  }, [supabase, fetchQueue]);

  const startBulk = useCallback(() => {
    if (!rows.length) return;
    const ids = rows.map((r) => r.id);
    setBulkQueue(ids);
    setSelectedId(ids[0] ?? null);
    toast.message(`Quoting ${ids.length} pending line(s)…`);
  }, [rows]);

  useEffect(() => {
    if (!selectedId) return;
    const evt = `parts-drawer:closed:${selectedId}`;
    const handler = () => {
      if (bulkActive) {
        const [, ...rest] = bulkQueue;
        setBulkQueue(rest);
        setSelectedId(rest[0] ?? null);
        if (rest.length === 0) void fetchQueue();
      } else {
        setSelectedId(null);
        void fetchQueue();
      }
    };
    window.addEventListener(evt, handler as EventListener);
    return () => window.removeEventListener(evt, handler as EventListener);
  }, [selectedId, bulkActive, bulkQueue, fetchQueue]);

  // ---- AI Apply: suggest + server inserts allocations + labor
  const aiApply = useCallback(
    async (row: QueueRow) => {
      if (!row.id) return;
      toast.loading("AI preparing parts & labor…", { id: `ai-${row.id}` });

      try {
        const suggestion = await requestQuoteSuggestion({
          item: row.description ?? "Job",
          notes: row.notes ?? "",
          section: "Quote Queue",
          status: "recommend",
          vehicle: row.vehicle ?? undefined,
        });

        if (!suggestion) {
          toast.error("AI returned no suggestion.", { id: `ai-${row.id}` });
          return;
        }

        const r = await fetch("/api/quotes/apply-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderLineId: row.id, suggestion }),
        });

        const j = (await r.json()) as {
          ok?: boolean;
          labor_applied?: boolean;
          unmatched?: { name: string; qty: number }[];
          error?: string;
        };
        if (!r.ok || !j?.ok) {
          throw new Error(j?.error || "Apply AI failed");
        }

        if (j.unmatched && j.unmatched.length) {
          const list = j.unmatched
            .map((u) => `${u.qty}× ${u.name}`)
            .join(", ");
          toast.message(`Some parts need manual matching: ${list}`, {
            id: `ai-${row.id}`,
          });
        } else {
          toast.success("AI parts & labor applied", { id: `ai-${row.id}` });
        }
        await fetchQueue();
      } catch (e) {
        toast.error(
          (e as { message?: string })?.message ?? "AI apply failed",
          { id: `ai-${row.id}` }
        );
      }
    },
    [fetchQueue]
  );

  // ---- Mark as quoted (still pending approval) + grow Saved Menu
  const markQuoted = useCallback(
    async (row: QueueRow) => {
      if (!row.id) return;
      toast.loading("Marking as quoted…", { id: `quoted-${row.id}` });

      try {
        // Create/merge Saved Menu record for this line
        const r = await fetch("/api/menu-items/upsert-from-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderLineId: row.id }),
        });

        let body: MenuUpsertResponse | null = null;
        let raw: string | null = null;
        try {
          raw = await r.text();
          body = raw ? (JSON.parse(raw) as MenuUpsertResponse) : null;
        } catch {
          // non-JSON or empty body
        }

        if (!r.ok || !body?.ok) {
          console.error("Menu upsert failed", {
            status: r.status,
            body: body ?? raw,
          });

          const reason =
            body?.detail ||
            body?.error ||
            (r.ok ? "Unknown error" : `HTTP ${r.status}`);

          // This mirrors the "Quoted, but couldn’t save to menu items" vibe,
          // but also surfaces the detail so you know *why*.
          toast.warning(
            `Quoted, but couldn’t save to menu items. ${reason}`,
            { id: `quoted-${row.id}` }
          );
          return;
        }

        // Keep approval_state as pending, but mark status + notes as quoted
        const nextNotes = `${row.notes ?? ""}`.includes("[quoted]")
          ? row.notes
          : [row.notes ?? "", "[quoted]"].filter(Boolean).join(" ").trim();

        const { error: ue } = await supabase
          .from("work_order_lines")
          .update(
            {
              status: "quoted",
              notes: nextNotes,
            } as DB["public"]["Tables"]["work_order_lines"]["Update"]
          )
          .eq("id", row.id);

        if (ue) {
          console.warn("Could not set line to quoted:", ue.message);
          toast.success(
            "Saved Menu updated, but line status could not be set to quoted.",
            { id: `quoted-${row.id}` }
          );
        } else {
          toast.success(
            "Marked as quoted (awaiting approval). Saved Menu updated.",
            { id: `quoted-${row.id}` }
          );
        }

        await fetchQueue();
      } catch (e) {
        console.error("markQuoted failed:", e);
        toast.error(
          (e as { message?: string })?.message ??
            "Failed to mark as quoted",
          { id: `quoted-${row.id}` }
        );
      }
    },
    [supabase, fetchQueue]
  );

  return (
    <div className="p-4 sm:p-6 text-white">
      <VoiceContextSetter currentView="parts_quoting" />

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quoting Queue</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/parts/inventory"
            className="text-sm text-orange-400 hover:underline"
          >
            Open Inventory →
          </Link>
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            onClick={startBulk}
            disabled={rows.length === 0}
          >
            Quote all pending ({rows.length})
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-red-300">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
        {/* LEFT: queue */}
        <div className="rounded border border-neutral-800 bg-neutral-900">
          <div className="border-b border-neutral-800 p-3 text-sm text-neutral-300">
            Pending approval lines
          </div>
          {loading ? (
            <div className="p-3 text-neutral-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-3 text-neutral-400">
              Nothing awaiting quoting.
            </div>
          ) : (
            <ul className="divide-y divide-neutral-800">
              {rows.map((r) => (
                <li key={r.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {r.description || r.complaint || "Untitled job"}
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-400">
                        WO:{" "}
                        {r.work_order?.custom_id ||
                          r.work_order?.id?.slice(0, 8) ||
                          "—"}{" "}
                        •{" "}
                        {r.vehicle
                          ? `${r.vehicle.year ?? ""} ${
                              r.vehicle.make ?? ""
                            } ${r.vehicle.model ?? ""}`.trim()
                          : "No vehicle"}{" "}
                        •{" "}
                        {r.created_at
                          ? format(new Date(r.created_at), "PPp")
                          : "—"}
                      </div>
                      {r.notes && (
                        <div className="mt-1 truncate text-xs text-neutral-400">
                          Notes: {r.notes}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className={chip(r.status)}>
                        {(r.status ?? "awaiting").replaceAll("_", " ")}
                      </span>
                      <button
                        type="button"
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                        onClick={() => void aiApply(r)}
                        title="AI: allocate parts + labor"
                      >
                        AI Apply
                      </button>
                      <button
                        type="button"
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                        onClick={() => setSelectedId(r.id)}
                        title="Open Parts Drawer"
                      >
                        Quote
                      </button>
                      <button
                        type="button"
                        className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-black hover:bg-emerald-500"
                        onClick={() => void markQuoted(r)}
                        title="Mark as quoted (keeps awaiting approval) and grow Saved Menu"
                      >
                        Mark Quoted
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* RIGHT: details */}
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="mb-2 text-lg font-semibold">Details</h2>
          {selected ? (
            <div className="space-y-2 text-sm">
              <div className="text-neutral-400">Work Order</div>
              <div className="font-medium">
                {selected.work_order
                  ? selected.work_order.custom_id ||
                    selected.work_order.id?.slice(0, 8)
                  : "—"}
              </div>

              <div className="text-neutral-400">Vehicle</div>
              <div className="font-medium">
                {selected.vehicle
                  ? (
                      `${selected.vehicle.year ?? ""} ${
                        selected.vehicle.make ?? ""
                      } ${selected.vehicle.model ?? ""}`.trim() || "—"
                    )
                  : "—"}
              </div>

              <div className="text-neutral-400">Customer</div>
              <div className="font-medium">
                {selected.customer
                  ? (
                      [
                        selected.customer.first_name ?? "",
                        selected.customer.last_name ?? "",
                      ]
                        .filter(Boolean)
                        .join(" ") || "—"
                    )
                  : "—"}
              </div>

              <div className="text-neutral-400">Description</div>
              <div className="font-medium">
                {selected.description ?? "—"}
              </div>

              <div className="text-neutral-400">Notes</div>
              <div className="whitespace-pre-wrap font-medium">
                {selected.notes ?? "—"}
              </div>
            </div>
          ) : (
            <div className="text-neutral-400">
              Select a line on the left to see details.
            </div>
          )}
        </div>
      </div>

      {/* Parts drawer */}
      {selected && selected.work_order?.id && (
        <PartsDrawer
          open
          workOrderId={selected.work_order.id}
          workOrderLineId={selected.id}
          vehicleSummary={
            selected.vehicle
              ? {
                  year:
                    (selected.vehicle.year as string | number | null)
                      ?.toString() ?? null,
                  make: selected.vehicle.make ?? null,
                  model: selected.vehicle.model ?? null,
                }
              : null
          }
          jobDescription={selected.description ?? null}
          jobNotes={selected.notes ?? null}
          closeEventName={`parts-drawer:closed:${selected.id}`}
        />
      )}

      <VoiceButton />
    </div>
  );
}