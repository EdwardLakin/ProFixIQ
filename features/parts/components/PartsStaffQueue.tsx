// features/parts/components/PartsStaffQueue.tsx (FULL FILE REPLACEMENT)
// Adds "Receive" UI for part_request_items (partial receive handling).
// No `any`. Uses Supabase row types.

"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { toast } from "sonner";

type DB = Database;
type UUID = string;

type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];
type PartRequestRow = DB["public"]["Tables"]["part_requests"]["Row"];
type StockLocRow = DB["public"]["Tables"]["stock_locations"]["Row"];

type QueueRow = {
  item: PartRequestItemRow;
  request: PartRequestRow | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export default function PartsStaffQueue() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<QueueRow[]>([]);

  // Receive modal state
  const [receiving, setReceiving] = useState<{
    open: boolean;
    itemId: UUID | null;
    shopId: UUID | null;
    partName: string;
    qtyRemaining: number;
  }>({ open: false, itemId: null, shopId: null, partName: "", qtyRemaining: 0 });

  const [locs, setLocs] = useState<StockLocRow[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [qty, setQty] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);

  const mainLocId = useMemo(() => {
    const main = locs.find((l) => (l.code ?? "").toUpperCase() === "MAIN");
    return (main?.id as string | undefined) ?? "";
  }, [locs]);

  async function loadQueue() {
    setLoading(true);
    setErr(null);

    try {
      const { data, error } = await supabase
        .from("part_request_items")
        .select(
          `
            *,
            part_requests:part_requests (
              id,
              shop_id,
              work_order_id,
              requested_by,
              assigned_tech_id,
              status,
              notes,
              created_at,
              job_id
            )
          `,
        )
        .in("status", [
          "approved",
          "reserved",
          "ordered",
          "picking",
          "picked",
          "partially_received",
          "received",
        ])
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      const mapped: QueueRow[] = (data ?? []).map((r) => {
        const item = r as PartRequestItemRow & { part_requests?: PartRequestRow | null };
        return {
          item,
          request: (item.part_requests ?? null) as PartRequestRow | null,
        };
      });

      setRows(mapped);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openReceive(row: QueueRow) {
    const it = row.item;
    const req = row.request;

    const shopId = s((it as unknown as { shop_id?: unknown }).shop_id) || s(req?.shop_id);

    const qtyRequested = num((it as unknown as { qty_requested?: unknown }).qty_requested ?? it.qty);
    const qtyApproved = num((it as unknown as { qty_approved?: unknown }).qty_approved);
    const qtyTarget = qtyApproved > 0 ? qtyApproved : qtyRequested;

    const qtyReceived = num((it as unknown as { qty_received?: unknown }).qty_received);
    const remaining = Math.max(0, qtyTarget - qtyReceived);

    if (!shopId) {
      toast.error("Missing shop_id on item; cannot load locations.");
      return;
    }

    // Load locations for this shop
    const { data: locRows, error: locErr } = await supabase
      .from("stock_locations")
      .select("id, code, name, shop_id")
      .eq("shop_id", shopId)
      .order("code");

    if (locErr) {
      toast.error(locErr.message);
      return;
    }

    setLocs((locRows ?? []) as StockLocRow[]);

    setReceiving({
      open: true,
      itemId: it.id as UUID,
      shopId: shopId as UUID,
      partName: String(it.description ?? "Part"),
      qtyRemaining: remaining,
    });

    const defaultLoc = (locRows ?? []).find((l) => (l.code ?? "").toUpperCase() === "MAIN")?.id;
    setLocationId(typeof defaultLoc === "string" ? defaultLoc : "");
    setQty(remaining > 0 ? Math.min(remaining, 1) : 1);
  }

  async function submitReceive() {
    if (!receiving.itemId) return;

    if (!locationId) {
      toast.error("Select a location.");
      return;
    }

    if (!qty || !Number.isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be > 0.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/parts/requests/items/${receiving.itemId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: locationId,
          qty,
        }),
      });

      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!res.ok || !json || json.error) {
        throw new Error(json?.error ?? "Receive failed");
      }

      toast.success("Received.");
      setReceiving({ open: false, itemId: null, shopId: null, partName: "", qtyRemaining: 0 });
      setLocs([]);
      setLocationId("");
      setQty(1);

      await loadQueue();
      window.dispatchEvent(new CustomEvent("parts:received"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Receive failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-sm text-neutral-400">Loading parts queue…</div>;
  if (err) return <div className="text-sm text-red-300">{err}</div>;
  if (rows.length === 0) return <div className="text-sm text-neutral-400">No queued parts right now.</div>;

  return (
    <div className="grid gap-3">
      {rows.map((r) => {
        const it = r.item;
        const req = r.request;

        const qtyRequested = num((it as unknown as { qty_requested?: unknown }).qty_requested ?? it.qty);
        const qtyApproved = num((it as unknown as { qty_approved?: unknown }).qty_approved);
        const qtyReserved = num((it as unknown as { qty_reserved?: unknown }).qty_reserved);
        const qtyReceived = num((it as unknown as { qty_received?: unknown }).qty_received);

        const qtyTarget = qtyApproved > 0 ? qtyApproved : qtyRequested;
        const remaining = Math.max(0, qtyTarget - qtyReceived);

        const status = String((it as unknown as { status?: unknown }).status ?? "");

        return (
          <div
            key={String(it.id)}
            className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-neutral-50">
                  {it.description ?? "Part"}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Status: <span className="text-neutral-200">{status || "—"}</span>
                  {req?.work_order_id ? (
                    <>
                      {" "}
                      • WO:{" "}
                      <span className="text-neutral-200">{String(req.work_order_id).slice(0, 8)}…</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-neutral-200">
                  Req {qtyRequested}
                </span>
                <span className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-neutral-200">
                  App {qtyApproved}
                </span>
                <span className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-neutral-200">
                  Res {qtyReserved}
                </span>
                <span className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-neutral-200">
                  Rcv {qtyReceived}
                </span>
                <span className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-neutral-200">
                  Rem {remaining}
                </span>

                <button
                  type="button"
                  onClick={() => openReceive(r)}
                  className="rounded-full border border-[color:var(--accent-copper,#f97316)]/70 bg-[color:var(--accent-copper,#f97316)]/10 px-3 py-1 text-neutral-50 hover:bg-[color:var(--accent-copper,#f97316)]/20"
                >
                  Receive
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Receive Modal */}
      {receiving.open ? (
        <div className="fixed inset-0 z-[700] flex items-center justify-center" onClick={() => setReceiving({ open: false, itemId: null, shopId: null, partName: "", qtyRemaining: 0 })}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative z-[710] w-full max-w-lg rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 p-5 shadow-[0_22px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Receive</div>
            <div className="mt-1 text-lg font-semibold text-white">{receiving.partName}</div>

            <div className="mt-3 grid gap-3">
              <div className="grid gap-1.5">
                <div className="text-xs text-neutral-500">Location</div>
                <select
                  value={locationId || mainLocId || ""}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100"
                >
                  <option value="">Select…</option>
                  {locs.map((l) => (
                    <option key={String(l.id)} value={String(l.id)}>
                      {l.code} — {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1.5">
                <div className="text-xs text-neutral-500">
                  Quantity (remaining {receiving.qtyRemaining})
                </div>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value || 0))}
                  className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100"
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReceiving({ open: false, itemId: null, shopId: null, partName: "", qtyRemaining: 0 })}
                  className="rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-neutral-200 hover:bg-black/60"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitReceive}
                  className="rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-[color:var(--accent-copper,#f97316)]/15 px-4 py-2 text-sm font-semibold text-neutral-50 hover:bg-[color:var(--accent-copper,#f97316)]/25 disabled:opacity-60"
                  disabled={submitting}
                >
                  {submitting ? "Receiving…" : "Receive"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}