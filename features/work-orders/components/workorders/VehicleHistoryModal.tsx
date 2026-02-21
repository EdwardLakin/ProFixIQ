// features/work-orders/components/workorders/extras/VehicleHistoryModal.tsx
"use client";

import Link from "next/link";
import { Dialog } from "@headlessui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { usePathname, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Allocation = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type Part = DB["public"]["Tables"]["parts"]["Row"];

type Row = Pick<
  WorkOrder,
  "id" | "custom_id" | "updated_at" | "created_at" | "customer_id" | "shop_id"
> & {
  customers?: Pick<Customer, "first_name" | "last_name" | "email" | "phone"> | null;
  partsSummary?: string;
};

function fmtCustomerName(c: Row["customers"]): string {
  if (!c) return "—";
  const name = [c.first_name ?? "", c.last_name ?? ""].filter(Boolean).join(" ").trim();
  return name.length ? name : "—";
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "PP");
}

function woLabel(r: Row): string {
  const c = (r.custom_id ?? "").trim();
  if (c) return `WO ${c}`;
  return `WO ${String(r.id).slice(0, 8)}…`;
}

export default function VehicleHistoryModal(props: {
  isOpen: boolean;
  onClose: () => void;
  vehicleId: string;
  shopId: string | null;
}): JSX.Element {
  const { isOpen, onClose, vehicleId, shopId } = props;

  const pathname = usePathname();
  const searchParams = useSearchParams();

  const supabase = useMemo(() => createBrowserSupabase(), []);
  const lastSetShopId = useRef<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  const ensureShopContext = useCallback(
    async (id: string | null) => {
      if (!id) return;
      if (lastSetShopId.current === id) return;

      const { error } = await supabase.rpc("set_current_shop_id", { p_shop_id: id });
      if (error) {
        lastSetShopId.current = null;
        throw error;
      }
      lastSetShopId.current = id;
    },
    [supabase],
  );

  const buildReturnUrl = useCallback((): string => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("vh", "1");
    sp.set("vh_vehicle", vehicleId);
    if (shopId) sp.set("vh_shop", shopId);
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams, vehicleId, shopId]);

  const load = useCallback(async () => {
    if (!vehicleId) return;

    setLoading(true);
    setErr(null);

    try {
      if (shopId) {
        try {
          await ensureShopContext(shopId);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[VehicleHistoryModal] set_current_shop_id failed:", e);
        }
      }

      // 1) Work orders for this vehicle
      let woQuery = supabase
        .from("work_orders")
        .select(
          "id, custom_id, updated_at, created_at, customer_id, shop_id, customers:customers(first_name,last_name,email,phone)",
        )
        .eq("vehicle_id", vehicleId)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (shopId) woQuery = woQuery.eq("shop_id", shopId);

      const { data: woData, error: woErr } = await woQuery;
      if (woErr) throw woErr;

      const woList = (Array.isArray(woData) ? woData : []) as unknown as Row[];
      const woIds = woList.map((w) => w.id).filter((id): id is string => typeof id === "string");

      if (woIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // 2) Completed lines (this defines "history")
      const { data: lineData, error: lineErr } = await supabase
        .from("work_order_lines")
        .select("id, work_order_id, status, complaint, description")
        .in("work_order_id", woIds)
        .eq("status", "completed");

      if (lineErr) throw lineErr;

      const lines = (Array.isArray(lineData) ? lineData : []) as unknown as WorkOrderLine[];
      const completedWoIds = new Set(
        lines
          .map((l) => l.work_order_id)
          .filter((id): id is string => typeof id === "string"),
      );

      // If no completed lines, show nothing (per your request)
      if (completedWoIds.size === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const filteredByCompleted = woList.filter((w) => completedWoIds.has(w.id));

      // 3) Parts used: allocations by those completed lines
      const lineIds = lines.map((l) => l.id).filter((id): id is string => typeof id === "string");

      const lineIdToWoId = new Map<string, string>();
      for (const l of lines) {
        if (typeof l.id === "string" && typeof l.work_order_id === "string") {
          lineIdToWoId.set(l.id, l.work_order_id);
        }
      }

      const { data: allocData, error: allocErr } = lineIds.length
        ? await supabase
            .from("work_order_part_allocations")
            .select("work_order_line_id, qty, part_id")
            .in("work_order_line_id", lineIds)
        : { data: [], error: null };

      if (allocErr) throw allocErr;

      const allocs = (Array.isArray(allocData) ? allocData : []) as unknown as Allocation[];
      const partIds = Array.from(
        new Set(allocs.map((a) => a.part_id).filter((id): id is string => typeof id === "string")),
      );

      const { data: partsData, error: partsErr } = partIds.length
        ? await supabase.from("parts").select("id, name").in("id", partIds)
        : { data: [], error: null };

      if (partsErr) throw partsErr;

      const parts = (Array.isArray(partsData) ? partsData : []) as unknown as Part[];
      const partNameById = new Map<string, string>();
      for (const p of parts) {
        if (typeof p.id === "string") partNameById.set(p.id, (p.name ?? "").toString());
      }

      // Aggregate per work order
      const woPartCounts = new Map<string, Map<string, number>>();
      for (const a of allocs) {
        const lineId = (a as unknown as { work_order_line_id?: string | null }).work_order_line_id ?? null;
        const partId = (a.part_id ?? null) as string | null;
        const qty = typeof a.qty === "number" && Number.isFinite(a.qty) ? a.qty : 1;

        if (!lineId || !partId) continue;

        const woId = lineIdToWoId.get(lineId);
        if (!woId) continue;

        const name = (partNameById.get(partId) ?? "").trim();
        if (!name) continue;

        const perWo = woPartCounts.get(woId) ?? new Map<string, number>();
        perWo.set(name, (perWo.get(name) ?? 0) + qty);
        woPartCounts.set(woId, perWo);
      }

      const withParts: Row[] = filteredByCompleted.map((w) => {
        const m = woPartCounts.get(w.id);
        if (!m || m.size === 0) return { ...w, partsSummary: "—" };

        // top 3, then +N more
        const pairs = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
        const top = pairs.slice(0, 3).map(([name, qty]) => `${qty}× ${name}`);
        const more = pairs.length > 3 ? ` +${pairs.length - 3} more` : "";
        return { ...w, partsSummary: `${top.join(", ")}${more}` };
      });

      // Search filter (no status now)
      const qlc = q.trim().toLowerCase();
      const searched = qlc
        ? withParts.filter((r) => {
            const cid = (r.custom_id ?? "").toLowerCase();
            const id = (r.id ?? "").toLowerCase();
            const cust = fmtCustomerName(r.customers ?? null).toLowerCase();
            const email = (r.customers?.email ?? "").toLowerCase();
            const phone = (r.customers?.phone ?? "").toLowerCase();
            const partsSummary = (r.partsSummary ?? "").toLowerCase();
            return (
              id.includes(qlc) ||
              cid.includes(qlc) ||
              cust.includes(qlc) ||
              email.includes(qlc) ||
              phone.includes(qlc) ||
              partsSummary.includes(qlc)
            );
          })
        : withParts;

      setRows(searched);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load history.";
      setErr(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [vehicleId, shopId, supabase, q, ensureShopContext]);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load]);

  const returnUrl = buildReturnUrl();

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-[120] flex items-center justify-center"
    >
      <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      <div
        className="relative z-[130] mx-4 my-6 w-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl border border-white/15 bg-neutral-950/95 p-4 text-white shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-200">
                Vehicle History
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">
                Showing work orders with completed lines {shopId ? "for this shop" : ""}.
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-neutral-200 hover:bg-white/5"
              title="Close"
            >
              ✕
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                Search
              </label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                placeholder="Custom ID, customer, parts…"
                className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-[var(--accent-copper-soft)] focus:ring-1 focus:ring-[var(--accent-copper-soft)]/60"
              />
            </div>

            <button
              type="button"
              onClick={load}
              className="rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-100 hover:border-[var(--accent-copper-soft)] hover:bg-black/70"
            >
              Refresh
            </button>
          </div>

          {err ? (
            <div className="rounded-xl border border-red-500/60 bg-red-950/60 px-4 py-3 text-sm text-red-100">
              {err}
            </div>
          ) : loading ? (
            <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-neutral-300">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/12 bg-black/30 px-4 py-3 text-sm text-neutral-300">
              No completed history found for this vehicle.
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-white/10 bg-black/35">
              <div className="grid grid-cols-12 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                <div className="col-span-3">Work Order</div>
                <div className="col-span-3">Customer</div>
                <div className="col-span-4">Parts used</div>
                <div className="col-span-2 text-right">Updated</div>
              </div>

              <ul className="divide-y divide-white/5">
                {rows.map((r) => {
                  const updatedIso = r.updated_at ?? r.created_at ?? null;
                  const updated = fmtDateShort(updatedIso);

                  const href = `/work-orders/view/${r.id}?return=${encodeURIComponent(returnUrl)}`;

                  return (
                    <li key={r.id} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
                      <div className="col-span-3 min-w-0">
                        <Link
                          href={href}
                          className="truncate font-mono text-[var(--accent-copper-light)] underline decoration-transparent underline-offset-2 hover:decoration-[var(--accent-copper-soft)]"
                        >
                          {woLabel(r)}
                        </Link>
                        <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                          {String(r.id).slice(0, 8)}…
                        </div>
                      </div>

                      <div className="col-span-3 min-w-0">
                        <div className="truncate text-neutral-200">
                          {fmtCustomerName(r.customers ?? null)}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                          {(r.customers?.email ?? "").toString() || "—"}
                        </div>
                      </div>

                      <div className="col-span-4 min-w-0">
                        <div className="truncate text-[12px] text-neutral-200" title={r.partsSummary ?? "—"}>
                          {r.partsSummary ?? "—"}
                        </div>
                      </div>

                      <div className="col-span-2 text-right text-[11px] text-neutral-400">
                        {updated}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-3 text-[11px] text-neutral-500">
            This list links to:{" "}
            <span className="font-mono text-neutral-300">/work-orders/view/[id]</span>{" "}
            with a <span className="font-mono text-neutral-300">return=</span> that can reopen this modal.
          </div>
        </div>
      </div>
    </Dialog>
  );
}